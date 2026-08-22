import { describe, expect, it, beforeEach } from "vitest";
import db from "../src/db";
import { computeExplainableThreat } from "../src/services/threat.service";
import {
  extractTokens,
  evaluatePairwiseCorroboration,
  resolveIndependentSourceCount,
  calculateDistanceKm
} from "../src/services/corroboration.service";

describe("THREAT ENGINE PROPERTY & INVARIANT ADVERSARIAL AUDIT", () => {
  beforeEach(() => {
    db.prepare("DELETE FROM events").run();
  });

  it("Invariant 1: Empty State produces baseline Level 1, STABLE trend, LOW confidence", () => {
    const analysis = computeExplainableThreat();

    expect(analysis.threatLevel).toBe(1);
    expect(analysis.threatLabel).toBe("DÜŞÜK");
    expect(analysis.temporalTrend).toBe("STABLE");
    expect(analysis.confidence).toBe("LOW");
    expect(analysis.metrics.totalEventsLast24h).toBe(0);
    expect(analysis.metrics.criticalEventsLast1h).toBe(0);
    expect(analysis.drivers.some((d) => d.factor === "BASELINE_ACTIVITY")).toBe(true);
  });

  it("Invariant 2: Monotonicity — adding critical events never decreases threat level", () => {
    const levels: number[] = [];

    levels.push(computeExplainableThreat().threatLevel);

    db.prepare(`
      INSERT INTO events (type, title, severity, source, createdAt)
      VALUES ('strike', 'Critical Event 1', '4', 'Reuters', @time)
    `).run({ time: new Date(Date.now() - 30 * 60_000).toISOString() });
    levels.push(computeExplainableThreat().threatLevel);

    db.prepare(`
      INSERT INTO events (type, title, severity, source, createdAt)
      VALUES ('strike', 'Critical Event 2', '5', 'BBC', @time1),
             ('strike', 'Critical Event 3', '4', 'ISW', @time2)
    `).run({
      time1: new Date(Date.now() - 20 * 60_000).toISOString(),
      time2: new Date(Date.now() - 10 * 60_000).toISOString()
    });
    levels.push(computeExplainableThreat().threatLevel);

    for (let i = 4; i <= 6; i++) {
      db.prepare(`
        INSERT INTO events (type, title, severity, source, createdAt)
        VALUES ('strike', 'Critical Event ${i}', '4', 'Reuters', @time)
      `).run({ time: new Date(Date.now() - 5 * 60_000).toISOString() });
    }
    levels.push(computeExplainableThreat().threatLevel);

    for (let i = 7; i <= 11; i++) {
      db.prepare(`
        INSERT INTO events (type, title, severity, source, createdAt)
        VALUES ('strike', 'Critical Event ${i}', '5', 'Reuters', @time)
      `).run({ time: new Date(Date.now() - 1 * 60_000).toISOString() });
    }
    levels.push(computeExplainableThreat().threatLevel);

    expect(levels).toEqual([1, 2, 3, 4, 5]);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThanOrEqual(levels[i - 1]);
    }
  });

  it("Invariant 3: Determinism & Idempotency — identical DB state produces identical threat output", () => {
    db.prepare(`
      INSERT INTO events (type, title, severity, source, lat, lng, createdAt)
      VALUES 
        ('strike', 'Damascus Air Raid', '4', 'BBC', 33.5138, 36.2765, @t1),
        ('strike', 'Damascus Air Raid Warehouse', '4', 'Reuters', 33.5130, 36.2770, @t2),
        ('strike', 'Beirut Drone Strike', '3', 'Al Jazeera', 33.8886, 35.4955, @t3),
        ('strike', 'Isfahan Blast', '4', 'Iran Int', 32.6546, 51.6680, @t4),
        ('strike', 'Tabriz Radar Hit', '4', 'Defense One', 38.0962, 46.2346, @t5)
    `).run({
      t1: new Date(Date.now() - 45 * 60_000).toISOString(),
      t2: new Date(Date.now() - 40 * 60_000).toISOString(),
      t3: new Date(Date.now() - 2 * 3600_000).toISOString(),
      t4: new Date(Date.now() - 3 * 3600_000).toISOString(),
      t5: new Date(Date.now() - 4 * 3600_000).toISOString()
    });

    const run1 = computeExplainableThreat();
    const run2 = computeExplainableThreat();

    expect(run1.threatLevel).toBe(run2.threatLevel);
    expect(run1.threatLabel).toBe(run2.threatLabel);
    expect(run1.confidence).toBe(run2.confidence);
    expect(run1.temporalTrend).toBe(run2.temporalTrend);
    expect(run1.metrics).toEqual(run2.metrics);
    expect(run1.drivers).toEqual(run2.drivers);
  });

  it("Invariant 4: Temporal Trend — accelerates when recent 6h > 1.5x prior 6h (count >= 4)", () => {
    db.prepare(`
      INSERT INTO events (type, title, severity, source, createdAt)
      VALUES 
        ('info', 'Prior Event 1', '2', 'BBC', @t1),
        ('info', 'Prior Event 2', '2', 'Reuters', @t2)
    `).run({
      t1: new Date(Date.now() - 10 * 3600_000).toISOString(),
      t2: new Date(Date.now() - 8 * 3600_000).toISOString()
    });

    for (let i = 1; i <= 6; i++) {
      db.prepare(`
        INSERT INTO events (type, title, severity, source, createdAt)
        VALUES ('strike', 'Recent Event ${i}', '3', 'ISW', @t)
      `).run({ t: new Date(Date.now() - i * 30 * 60_000).toISOString() });
    }

    const analysis = computeExplainableThreat();
    expect(analysis.temporalTrend).toBe("ESCALATING");
    expect(analysis.drivers.some((d) => d.factor === "FREQUENCY_SPIKE")).toBe(true);
  });

  it("Invariant 5: Temporal Trend — de-escalates when recent 6h < 0.5x prior 6h (prior >= 4)", () => {
    for (let i = 1; i <= 6; i++) {
      db.prepare(`
        INSERT INTO events (type, title, severity, source, createdAt)
        VALUES ('strike', 'Prior Heavy Event ${i}', '3', 'ISW', @t)
      `).run({ t: new Date(Date.now() - (7 * 3600_000 + i * 30 * 60_000)).toISOString() });
    }

    db.prepare(`
      INSERT INTO events (type, title, severity, source, createdAt)
      VALUES ('info', 'Recent Lone Event', '2', 'BBC', @t)
    `).run({ t: new Date(Date.now() - 2 * 3600_000).toISOString() });

    const analysis = computeExplainableThreat();
    expect(analysis.temporalTrend).toBe("DE-ESCALATING");
    expect(analysis.drivers.some((d) => d.factor === "ACTIVITY_DOWNTREND")).toBe(true);
  });

  it("Invariant 6: Geographic Dispersion activates when 4+ distinct coordinate sectors are active", () => {
    db.prepare(`
      INSERT INTO events (type, title, severity, source, lat, lng, createdAt)
      VALUES 
        ('strike', 'Damascus Event', '3', 'BBC', 33.5138, 36.2765, @t),
        ('strike', 'Beirut Event', '3', 'Reuters', 33.8886, 35.4955, @t),
        ('strike', 'Isfahan Event', '3', 'Iran Int', 32.6546, 51.6680, @t),
        ('strike', 'Hodeidah Event', '3', 'Al Jazeera', 14.7978, 42.9545, @t)
    `).run({ t: new Date(Date.now() - 2 * 3600_000).toISOString() });

    const analysis = computeExplainableThreat();
    expect(analysis.metrics.activeHotspotsCount).toBe(4);
    expect(analysis.drivers.some((d) => d.factor === "GEOGRAPHIC_DISPERSION")).toBe(true);
  });

  it("Invariant 7: Missing Coordinates — events with null lat/lng do not crash analysis", () => {
    for (let i = 1; i <= 5; i++) {
      db.prepare(`
        INSERT INTO events (type, title, severity, source, lat, lng, createdAt)
        VALUES ('strike', 'Null Geo Event ${i}', '4', 'Reuters', NULL, NULL, @t)
      `).run({ t: new Date(Date.now() - i * 10 * 60_000).toISOString() });
    }

    const analysis = computeExplainableThreat();
    expect(analysis.threatLevel).toBe(3);
    expect(analysis.metrics.activeHotspotsCount).toBe(0);
    expect(analysis.metrics.criticalEventsLast1h).toBe(5);
  });

  it("Invariant 8: Independence of Threat Level vs Evidence Confidence (Orthogonal Dimensions)", () => {
    // Case A: High Threat (Level 5) with LOW Evidence Confidence (single unverified feed spamming critical events)
    for (let i = 1; i <= 12; i++) {
      db.prepare(`
        INSERT INTO events (type, title, severity, source, lat, lng, createdAt)
        VALUES ('strike', 'Lone Source Critical Blast ${i}', '5', 'Unverified Blog', 33.5, 36.2, @t)
      `).run({ t: new Date(Date.now() - i * 2 * 60_000).toISOString() });
    }

    const analysisA = computeExplainableThreat();
    expect(analysisA.threatLevel).toBe(5);
    expect(analysisA.confidence).not.toBe("HIGH");

    // Case B: Low Threat (Level 1) with HIGH Evidence Confidence (3 separate multi-source corroborated low-level activities)
    db.prepare("DELETE FROM events").run();
    const tB = new Date(Date.now() - 2 * 3600_000).toISOString();

    // Cluster 1: Northern border patrol
    db.prepare(`
      INSERT INTO events (type, title, description, severity, source, lat, lng, createdAt)
      VALUES 
        ('info', 'Northern border patrol checkpoint inspection', 'Routine vehicle inspection', '2', 'Reuters', 33.1, 35.1, '${tB}'),
        ('info', 'Northern border patrol checkpoint inspection', 'Routine vehicle inspection', '2', 'BBC World', 33.101, 35.101, '${tB}'),
        ('info', 'Northern border patrol checkpoint inspection', 'Routine vehicle inspection', '2', 'ISW', 33.099, 35.099, '${tB}')
    `).run();

    // Cluster 2: Maritime port cargo review
    db.prepare(`
      INSERT INTO events (type, title, description, severity, source, lat, lng, createdAt)
      VALUES 
        ('info', 'Maritime coastal port cargo review scheduled', 'Routine commercial vessel check', '2', 'Reuters', 32.8, 34.9, '${tB}'),
        ('info', 'Maritime coastal port cargo review scheduled', 'Routine commercial vessel check', '2', 'BBC World', 32.801, 34.901, '${tB}'),
        ('info', 'Maritime coastal port cargo review scheduled', 'Routine commercial vessel check', '2', 'Defense One', 32.799, 34.899, '${tB}')
    `).run();

    // Cluster 3: Radar sensor technical calibration
    db.prepare(`
      INSERT INTO events (type, title, description, severity, source, lat, lng, createdAt)
      VALUES 
        ('info', 'Radar sensor technical calibration completed', 'Routine sensor maintenance', '2', 'Reuters', 31.9, 34.8, '${tB}'),
        ('info', 'Radar sensor technical calibration completed', 'Routine sensor maintenance', '2', 'BBC World', 31.901, 34.801, '${tB}'),
        ('info', 'Radar sensor technical calibration completed', 'Routine sensor maintenance', '2', 'ISW', 31.899, 34.799, '${tB}')
    `).run();

    const analysisB = computeExplainableThreat();
    expect(analysisB.threatLevel).toBe(1);
    expect(analysisB.confidence).toBe("HIGH");
  });

  it("Invariant 9: Scale and Out-of-Order Robustness with Identical Timestamps", () => {
    const fixedIso = new Date(Date.now() - 15 * 60_000).toISOString();

    const insertStmt = db.prepare(`
      INSERT INTO events (type, title, severity, source, createdAt)
      VALUES ('strike', @title, '4', 'Reuters', '${fixedIso}')
    `);

    db.transaction(() => {
      for (let i = 0; i < 50; i++) {
        insertStmt.run({ title: `Simultaneous strike ${i}` });
      }
    })();

    const analysis = computeExplainableThreat();
    expect(analysis.threatLevel).toBe(5);
    expect(analysis.metrics.criticalEventsLast1h).toBe(50);
  });

  it("Invariant 10: Database Row Ordering Independence", () => {
    const now = Date.now();
    const eventRows = [
      { type: "strike", title: "Event Alpha", severity: "4", source: "Reuters", t: new Date(now - 10 * 60_000).toISOString() },
      { type: "strike", title: "Event Beta", severity: "5", source: "BBC", t: new Date(now - 20 * 60_000).toISOString() },
      { type: "strike", title: "Event Gamma", severity: "4", source: "ISW", t: new Date(now - 30 * 60_000).toISOString() },
      { type: "info", title: "Event Delta", severity: "2", source: "AFP", t: new Date(now - 8 * 3600_000).toISOString() }
    ];

    for (const ev of eventRows) {
      db.prepare(`
        INSERT INTO events (type, title, severity, source, createdAt)
        VALUES (@type, @title, @severity, @source, @t)
      `).run(ev);
    }
    const resultForward = computeExplainableThreat();

    db.prepare("DELETE FROM events").run();
    for (const ev of [...eventRows].reverse()) {
      db.prepare(`
        INSERT INTO events (type, title, severity, source, createdAt)
        VALUES (@type, @title, @severity, @source, @t)
      `).run(ev);
    }
    const resultReverse = computeExplainableThreat();

    expect(resultForward.threatLevel).toBe(resultReverse.threatLevel);
    expect(resultForward.threatLabel).toBe(resultReverse.threatLabel);
    expect(resultForward.temporalTrend).toBe(resultReverse.temporalTrend);
    expect(resultForward.confidence).toBe(resultReverse.confidence);
    expect(resultForward.metrics).toEqual(resultReverse.metrics);
  });

  it("Invariant 11: Single Token Contribution — one semantic concept never contributes duplicate canonical tokens", () => {
    const testConcepts = [
      { text: "airstrike and aerial bombardment", expectedCanonicalCount: 1, canonical: "__act_strike__" },
      { text: "kamikaze drone and unmanned uav", expectedCanonicalCount: 1, canonical: "__act_drone__" },
      { text: "ballistic missile salvo barrage", expectedCanonicalCount: 1, canonical: "__act_missile__" },
      { text: "surveillance radar station", expectedCanonicalCount: 1, canonical: "__target_radar__" },
      { text: "underground subterranean bunker", expectedCanonicalCount: 1, canonical: "__target_bunker__" }
    ];

    for (const item of testConcepts) {
      const tokens = extractTokens(item.text);
      const canonicals = Array.from(tokens).filter((t) => t.startsWith("__"));

      // Exactly 1 canonical token must be generated for the concept
      expect(canonicals).toContain(item.canonical);
      // No duplicate variants of the same concept (e.g. no __strike__ + __act_strike__)
      expect(canonicals.length).toBe(item.expectedCanonicalCount);
    }
  });

  it("Invariant 12: Corroboration Symmetry — pairwise corroboration is strictly symmetric", () => {
    const pairs = [
      {
        a: { title: "Airstrike on Damascus airport warehouse", lat: 33.5138, lng: 36.2765, hoursAgo: 1 },
        b: { title: "Damascus airfield munitions depot bombed", lat: 33.5140, lng: 36.2770, hoursAgo: 1.2 }
      },
      {
        a: { title: "Beirut drone strike", lat: 33.8886, lng: 35.4955, hoursAgo: 2 },
        b: { title: "Tehran protest rally", lat: 35.6892, lng: 51.3890, hoursAgo: 2 }
      },
      {
        a: { title: "Isfahan air defense drill", lat: 32.6546, lng: 51.6680, hoursAgo: 1 },
        b: { title: "Isfahan missile strike on defense site", lat: 32.6550, lng: 51.6675, hoursAgo: 1 }
      }
    ];

    for (const p of pairs) {
      const tokensA = extractTokens(p.a.title);
      const tokensB = extractTokens(p.b.title);

      const decisionAB = evaluatePairwiseCorroboration(
        { lat: p.a.lat, lng: p.a.lng, tokens: tokensA, hoursAgo: p.a.hoursAgo },
        { lat: p.b.lat, lng: p.b.lng, tokens: tokensB, hoursAgo: p.b.hoursAgo }
      );

      const decisionBA = evaluatePairwiseCorroboration(
        { lat: p.b.lat, lng: p.b.lng, tokens: tokensB, hoursAgo: p.b.hoursAgo },
        { lat: p.a.lat, lng: p.a.lng, tokens: tokensA, hoursAgo: p.a.hoursAgo }
      );

      expect(decisionAB.isMatch).toBe(decisionBA.isMatch);
      expect(decisionAB.hardSplitReason).toBe(decisionBA.hardSplitReason);
    }
  });

  it("Invariant 13: Corroboration Determinism — repeated pairwise evaluations are strictly deterministic", () => {
    const evA = { title: "Airstrike on Aleppo airfield", lat: 36.2021, lng: 37.1343, hoursAgo: 1.5 };
    const evB = { title: "Aleppo airport runway damaged by aerial attack", lat: 36.2025, lng: 37.1340, hoursAgo: 1.6 };

    const tokensA = extractTokens(evA.title);
    const tokensB = extractTokens(evB.title);

    const first = evaluatePairwiseCorroboration(
      { lat: evA.lat, lng: evA.lng, tokens: tokensA, hoursAgo: evA.hoursAgo },
      { lat: evB.lat, lng: evB.lng, tokens: tokensB, hoursAgo: evB.hoursAgo }
    );

    for (let i = 0; i < 20; i++) {
      const next = evaluatePairwiseCorroboration(
        { lat: evA.lat, lng: evA.lng, tokens: tokensA, hoursAgo: evA.hoursAgo },
        { lat: evB.lat, lng: evB.lng, tokens: tokensB, hoursAgo: evB.hoursAgo }
      );
      expect(next).toEqual(first);
    }
  });

  it("Invariant 14: Source Independence Resistance — syndicated copies do not inflate independent source count", () => {
    const syndicatedReports = [
      { source: "Portal Alpha", title: "Reuters reports missile strike near Damascus airport", description: "According to Reuters..." },
      { source: "Portal Beta", title: "Reuters reports missile strike near Damascus airport", description: "Reuters news agency..." },
      { source: "Portal Gamma", title: "Reuters reports missile strike near Damascus airport", description: "Reuters correspondent noted..." },
      { source: "Portal Delta", title: "Reuters reports missile strike near Damascus airport", description: "Sourced from Reuters..." },
      { source: "Portal Epsilon", title: "Reuters reports missile strike near Damascus airport", description: "Via Reuters wire..." }
    ];

    const independence = resolveIndependentSourceCount(syndicatedReports);
    // All 5 syndicated copies originate from wire:reuters -> independentCount MUST be 1
    expect(independence.independentCount).toBe(1);
    expect(independence.sourceClusters).toEqual(["wire:reuters"]);
  });

  it("Invariant 15: Geographic Boundary Fail-Closed — invalid coordinates fail closed to Infinity distance", () => {
    expect(calculateDistanceKm(null, null, 32.0, 34.0)).toBe(Infinity);
    expect(calculateDistanceKm(32.0, 34.0, null, null)).toBe(Infinity);
    expect(calculateDistanceKm(95.0, 34.0, 32.0, 34.0)).toBe(Infinity); // lat > 90
    expect(calculateDistanceKm(-95.0, 34.0, 32.0, 34.0)).toBe(Infinity); // lat < -90
    expect(calculateDistanceKm(32.0, 195.0, 32.0, 34.0)).toBe(Infinity); // lng > 180
    expect(calculateDistanceKm(NaN, 34.0, 32.0, 34.0)).toBe(Infinity);
  });

  it("Invariant 16: Language Invariance — equivalent Turkish & English phrases extract equivalent canonical tokens", () => {
    const enTokens = extractTokens("Air defense intercepted kamikaze drone near Damascus international airport");
    const trTokens = extractTokens("Sam uluslararasi havalimani yakinlarinda hava savunmasi kamikaze iha dusurdu");

    expect(enTokens.has("__act_intercept__")).toBe(true);
    expect(trTokens.has("__act_intercept__")).toBe(true);

    expect(enTokens.has("__act_drone__")).toBe(true);
    expect(trTokens.has("__act_drone__")).toBe(true);

    expect(enTokens.has("__target_airport__")).toBe(true);
    expect(trTokens.has("__target_airport__")).toBe(true);

    expect(enTokens.has("__loc_damascus__")).toBe(true);
    expect(trTokens.has("__loc_damascus__")).toBe(true);
  });
});
