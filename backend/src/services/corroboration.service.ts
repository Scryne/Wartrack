import db from "../db";
import { sqliteIsoNow } from "../lib/time";

export interface CorroboratedCluster {
  clusterId: string;
  primaryEvent: {
    id: number;
    title: string;
    type: string;
    severity: string;
    source: string | null;
    lat: number | null;
    lng: number | null;
    createdAt: string;
  };
  eventIds: number[];
  sources: string[];
  independentSourceCount: number;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "UNVERIFIED";
  conflictingReports: boolean;
  firstReportedAt: string;
  lastReportedAt: string;
  summary: string;
}

interface RawEvent {
  id: number;
  type: string;
  title: string;
  description: string | null;
  severity: string;
  source: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: string;
}

const SPECULATIVE_PATTERNS = [/unconfirmed/i, /iddia/i, /rumor/i, /alleged/i, /çelişkili/i, /claimed/i];
const VERIFIED_ORGANIZATIONS = ["ISW", "Defense One", "War on the Rocks", "Reuters", "BBC World"];

function extractTokens(str: string): Set<string> {
  return new Set(
    str
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 3)
  );
}

function calculateJaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersectionSize = 0;
  for (const token of setA) {
    if (setB.has(token)) intersectionSize++;
  }
  const unionSize = setA.size + setB.size - intersectionSize;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

function geoDistanceSq(lat1: number | null, lng1: number | null, lat2: number | null, lng2: number | null): number {
  if (lat1 === null || lng1 === null || lat2 === null || lng2 === null) return Infinity;
  const dLat = lat1 - lat2;
  const dLng = lng1 - lng2;
  return dLat * dLat + dLng * dLng;
}

/**
 * Clusters recent tactical events by geographic proximity, temporal window, and semantic overlap.
 * Uses conservative clustering to avoid merging unrelated incidents.
 */
export function clusterRecentEvents(hours = 24): CorroboratedCluster[] {
  const cutoffIso = new Date(Date.now() - hours * 3_600_000).toISOString();

  const events = db
    .prepare(
      `SELECT id, type, title, description, severity, source, lat, lng, createdAt
       FROM events
       WHERE createdAt > ?
       ORDER BY createdAt DESC`
    )
    .all(cutoffIso) as RawEvent[];

  if (events.length === 0) return [];

  const clusters: RawEvent[][] = [];
  const eventTokenMap = new Map<number, Set<string>>();

  for (const ev of events) {
    eventTokenMap.set(ev.id, extractTokens(`${ev.title} ${ev.description ?? ""}`));
  }

  for (const ev of events) {
    let matchedCluster: RawEvent[] | null = null;
    const evTokens = eventTokenMap.get(ev.id)!;
    const evTime = new Date(ev.createdAt).getTime();

    for (const cluster of clusters) {
      const leader = cluster[0];
      const leaderTime = new Date(leader.createdAt).getTime();
      const timeDiffHours = Math.abs(evTime - leaderTime) / 3_600_000;

      // Conservative temporal window: events must be within 6 hours of each other
      if (timeDiffHours > 6) continue;

      const geoClose = geoDistanceSq(ev.lat, ev.lng, leader.lat, leader.lng) < 0.25; // ~50km
      const leaderTokens = eventTokenMap.get(leader.id)!;
      const sim = calculateJaccardSimilarity(evTokens, leaderTokens);

      // Match criteria: either geographically close with moderate semantic overlap, or very high semantic overlap
      if ((geoClose && sim >= 0.2) || sim >= 0.45) {
        matchedCluster = cluster;
        break;
      }
    }

    if (matchedCluster) {
      matchedCluster.push(ev);
    } else {
      clusters.push([ev]);
    }
  }

  return clusters.map((group, idx) => {
    // Sort by severity descending, then createdAt ascending
    const sorted = [...group].sort((a, b) => {
      const sevDiff = Number(b.severity) - Number(a.severity);
      if (sevDiff !== 0) return sevDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    const primary = sorted[0];
    const sourcesSet = new Set<string>();
    let hasSpeculative = false;

    const timestamps: number[] = [];

    for (const item of sorted) {
      if (item.source) sourcesSet.add(item.source);
      const fullText = `${item.title} ${item.description ?? ""}`;
      if (SPECULATIVE_PATTERNS.some((p) => p.test(fullText))) {
        hasSpeculative = true;
      }
      timestamps.push(new Date(item.createdAt).getTime());
    }

    const sources = Array.from(sourcesSet);
    const independentSourceCount = sources.length;

    let confidence: CorroboratedCluster["confidence"] = "LOW";
    if (hasSpeculative && independentSourceCount < 2) {
      confidence = "UNVERIFIED";
    } else if (independentSourceCount >= 3) {
      confidence = "HIGH";
    } else if (independentSourceCount === 2 || sources.some((s) => VERIFIED_ORGANIZATIONS.includes(s))) {
      confidence = "MEDIUM";
    }

    const minTime = new Date(Math.min(...timestamps)).toISOString();
    const maxTime = new Date(Math.max(...timestamps)).toISOString();

    return {
      clusterId: `cluster-${primary.id}-${idx}`,
      primaryEvent: {
        id: primary.id,
        title: primary.title,
        type: primary.type,
        severity: primary.severity,
        source: primary.source,
        lat: primary.lat,
        lng: primary.lng,
        createdAt: primary.createdAt
      },
      eventIds: sorted.map((e) => e.id),
      sources,
      independentSourceCount,
      confidence,
      conflictingReports: hasSpeculative && independentSourceCount > 1,
      firstReportedAt: minTime,
      lastReportedAt: maxTime,
      summary: `${independentSourceCount} kaynak tarafından raporlandı (${confidence} Güvenirlik).`
    };
  });
}
