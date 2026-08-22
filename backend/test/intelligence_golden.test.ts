import { describe, expect, it, beforeEach } from "vitest";
import { clusterRecentEvents } from "../src/services/corroboration.service";
import { computeExplainableThreat } from "../src/services/threat.service";
import db from "../src/db";

interface GoldenTestCase {
  id: string;
  name: string;
  events: Array<{
    title: string;
    description: string;
    severity: string;
    source: string;
    lat: number | null;
    lng: number | null;
    hoursAgo: number;
  }>;
  expectedClustersCount: number;
  expectedConfidence: "HIGH" | "MEDIUM" | "LOW" | "UNVERIFIED";
  expectedConflicting: boolean;
  expectedSourceCount: number;
}

const GOLDEN_DATASET: GoldenTestCase[] = [
  {
    id: "TC-01",
    name: "Same Event / High Lexical Overlap / Multi-Source (ISW, BBC, Reuters)",
    events: [
      {
        title: "Israeli Air Force strikes targets near Damascus international airport",
        description: "Multiple airstrikes reported near Damascus international airport destroying military warehouses.",
        severity: "4",
        source: "BBC World",
        lat: 33.5138,
        lng: 36.2765,
        hoursAgo: 2
      },
      {
        title: "Airstrikes reported near Damascus international airport warehouse targets",
        description: "Israeli jets conducted targeted airstrikes against logistics sites near Damascus airport.",
        severity: "4",
        source: "ISW",
        lat: 33.5130,
        lng: 36.2770,
        hoursAgo: 2.5
      },
      {
        title: "Damascus airport military targets hit by Israeli airstrikes",
        description: "Syrian air defense engaged incoming missiles targeting facilities near Damascus international airport.",
        severity: "4",
        source: "Reuters",
        lat: 33.5145,
        lng: 36.2750,
        hoursAgo: 1.8
      }
    ],
    expectedClustersCount: 1,
    expectedConfidence: "HIGH",
    expectedConflicting: false,
    expectedSourceCount: 3
  },
  {
    id: "TC-02",
    name: "Single Source Repeated Reporting (BBC post updates)",
    events: [
      {
        title: "Explosion heard in southern Beirut suburb of Dahiyeh",
        description: "Breaking news: loud blast reported in Beirut southern district.",
        severity: "3",
        source: "BBC World",
        lat: 33.8886,
        lng: 35.4955,
        hoursAgo: 3
      },
      {
        title: "Smoke rising after explosion in southern Beirut Dahiyeh area",
        description: "Follow up: smoke plumes visible following the explosion in Dahiyeh suburb of Beirut.",
        severity: "3",
        source: "BBC World",
        lat: 33.8880,
        lng: 35.4960,
        hoursAgo: 2.2
      }
    ],
    expectedClustersCount: 1,
    expectedConfidence: "MEDIUM", // BBC is in VERIFIED_ORGANIZATIONS -> MEDIUM
    expectedConflicting: false,
    expectedSourceCount: 1
  },
  {
    id: "TC-03",
    name: "Speculative / Conflicting Rumors from Multiple Sources",
    events: [
      {
        title: "Unconfirmed rumors of missile strike on Isfahan military complex",
        description: "Social media claims allege unconfirmed attack on Iranian defense site in Isfahan.",
        severity: "4",
        source: "Middle East Eye",
        lat: 32.6546,
        lng: 51.6680,
        hoursAgo: 1.5
      },
      {
        title: "Iranian officials deny claimed strike on Isfahan military site",
        description: "State media insists air defense drill caused loud sounds near Isfahan defense research facility.",
        severity: "3",
        source: "Iran Int'l",
        lat: 32.6550,
        lng: 51.6670,
        hoursAgo: 1.0
      }
    ],
    expectedClustersCount: 1,
    expectedConfidence: "MEDIUM",
    expectedConflicting: true, // has speculative pattern + multiple sources
    expectedSourceCount: 2
  },
  {
    id: "TC-04",
    name: "Same Location / Temporal Window Exceeded (>6 Hours Gap)",
    events: [
      {
        title: "Early morning drone interception over Tel Aviv coast",
        description: "Air defense batteries intercepted suspicious aerial target over Tel Aviv shoreline at dawn.",
        severity: "4",
        source: "Jerusalem Post",
        lat: 32.0853,
        lng: 34.7818,
        hoursAgo: 14
      },
      {
        title: "Evening missile warning sirens activated across central Tel Aviv",
        description: "Rocket alert sirens sounded in Tel Aviv metropolitan area during evening hours.",
        severity: "4",
        source: "Ynetnews",
        lat: 32.0853,
        lng: 34.7818,
        hoursAgo: 2
      }
    ],
    expectedClustersCount: 2, // 14h vs 2h -> diff is 12h > 6h -> must NOT merge
    expectedConfidence: "LOW",
    expectedConflicting: false,
    expectedSourceCount: 1
  },
  {
    id: "TC-05",
    name: "Geographically Distant Events on Same Day",
    events: [
      {
        title: "Ballistic missile launch detected from Kermanshah underground base",
        description: "Satellite imagery confirms missile activity in western Iran Kermanshah facilities.",
        severity: "4",
        source: "Defense One",
        lat: 34.3142,
        lng: 47.0650,
        hoursAgo: 3
      },
      {
        title: "Naval patrol vessel targeted near Bab el-Mandeb strait",
        description: "Commercial shipping vessel reports drone attack in southern Red Sea navigation corridor.",
        severity: "4",
        source: "War on the Rocks",
        lat: 12.5833,
        lng: 43.3333,
        hoursAgo: 3.5
      }
    ],
    expectedClustersCount: 2, // Kermanshah vs Bab el-Mandeb -> thousands of km apart
    expectedConfidence: "MEDIUM",
    expectedConflicting: false,
    expectedSourceCount: 1
  }
];

describe("INTELLIGENCE ENGINE & GOLDEN DATASET VALIDATION", () => {
  beforeEach(() => {
    // Clear events table for clean deterministic benchmark runs
    db.prepare("DELETE FROM events").run();
    db.prepare("DELETE FROM articles").run();
  });

  it("evaluates corroboration clustering against the golden dataset", () => {
    let trueMerges = 0;
    let falseMerges = 0;
    let falseSplits = 0;

    for (const testCase of GOLDEN_DATASET) {
      db.prepare("DELETE FROM events").run();

      for (const ev of testCase.events) {
        const createdAt = new Date(Date.now() - ev.hoursAgo * 3_600_000).toISOString();
        db.prepare(`
          INSERT INTO events (type, title, description, severity, source, lat, lng, createdAt)
          VALUES ('strike', @title, @description, @severity, @source, @lat, @lng, @createdAt)
        `).run({
          title: ev.title,
          description: ev.description,
          severity: ev.severity,
          source: ev.source,
          lat: ev.lat,
          lng: ev.lng,
          createdAt
        });
      }

      const clusters = clusterRecentEvents(24);

      if (clusters.length === testCase.expectedClustersCount) {
        trueMerges++;
      } else if (clusters.length < testCase.expectedClustersCount) {
        falseMerges++;
      } else {
        falseSplits++;
      }

      expect(clusters.length, `Cluster count mismatch on ${testCase.name}`).toBe(testCase.expectedClustersCount);

      if (testCase.expectedClustersCount === 1 && clusters.length === 1) {
        const cluster = clusters[0];
        expect(cluster.independentSourceCount, `Source count mismatch on ${testCase.name}`).toBe(testCase.expectedSourceCount);
        expect(cluster.confidence, `Confidence mismatch on ${testCase.name}`).toBe(testCase.expectedConfidence);
        expect(cluster.conflictingReports, `Conflicting status mismatch on ${testCase.name}`).toBe(testCase.expectedConflicting);
      }
    }

    const precision = trueMerges / (trueMerges + falseMerges);
    const recall = trueMerges / (trueMerges + falseSplits);
    const f1 = (2 * precision * recall) / (precision + recall);

    console.info(`\n[GOLDEN DATASET METRICS]`);
    console.info(`  Total Test Cases: ${GOLDEN_DATASET.length}`);
    console.info(`  True Cluster Matches: ${trueMerges}`);
    console.info(`  False Merges: ${falseMerges}`);
    console.info(`  False Splits: ${falseSplits}`);
    console.info(`  Precision: ${(precision * 100).toFixed(1)}%`);
    console.info(`  Recall: ${(recall * 100).toFixed(1)}%`);
    console.info(`  F1-Score: ${(f1 * 100).toFixed(1)}%`);

    expect(f1).toBeGreaterThanOrEqual(0.9);
  });

  it("verifies explainable threat engine behavior and boundary conditions", () => {
    // 1. Empty dataset behavior
    db.prepare("DELETE FROM events").run();
    const emptyAnalysis = computeExplainableThreat();
    expect(emptyAnalysis.threatLevel).toBe(1);
    expect(emptyAnalysis.threatLabel).toBe("DÜŞÜK");
    expect(emptyAnalysis.temporalTrend).toBe("STABLE");
    expect(emptyAnalysis.confidence).toBe("LOW");

    // 2. High severity surge (CRITICAL_BURST_1H)
    const nowIso = new Date().toISOString();
    for (let i = 0; i < 12; i++) {
      db.prepare(`
        INSERT INTO events (type, title, description, severity, source, lat, lng, createdAt)
        VALUES ('strike', 'Critical missile attack ' || @i, 'Airstrike hit', '5', 'ISW', 32.0, 34.0, @nowIso)
      `).run({ i, nowIso });
    }

    const surgeAnalysis = computeExplainableThreat();
    expect(surgeAnalysis.threatLevel).toBe(5);
    expect(surgeAnalysis.threatLabel).toBe("KRİTİK ALARM");
    expect(surgeAnalysis.drivers.some((d) => d.factor === "CRITICAL_BURST_1H")).toBe(true);

    // 3. Frequency escalation trend
    // 10 events in recent 6h, 1 event in prior 6-12h
    db.prepare("DELETE FROM events").run();
    for (let i = 0; i < 8; i++) {
      const recentTime = new Date(Date.now() - 2 * 3_600_000).toISOString();
      db.prepare(`
        INSERT INTO events (type, title, severity, source, createdAt)
        VALUES ('strike', 'Recent event ' || @i, '3', 'BBC', @recentTime)
      `).run({ i, recentTime });
    }
    const priorTime = new Date(Date.now() - 8 * 3_600_000).toISOString();
    db.prepare(`
      INSERT INTO events (type, title, severity, source, createdAt)
      VALUES ('strike', 'Prior event', '3', 'BBC', @priorTime)
    `).run({ priorTime });

    const trendAnalysis = computeExplainableThreat();
    expect(trendAnalysis.temporalTrend).toBe("ESCALATING");
    expect(trendAnalysis.drivers.some((d) => d.factor === "FREQUENCY_SPIKE")).toBe(true);
  });
});
