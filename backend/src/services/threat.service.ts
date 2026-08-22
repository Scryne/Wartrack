import db from "../db";
import { sqliteIsoNow } from "../lib/time";
import { clusterRecentEvents } from "./corroboration.service";

export interface ThreatDriver {
  factor: string;
  weight: number;
  description: string;
}

export interface ExplainableThreatAnalysis {
  threatLevel: 1 | 2 | 3 | 4 | 5;
  threatLabel: "DÜŞÜK" | "KONTROL ALTINDA" | "GERİLİM" | "YÜKSEK RİSK" | "KRİTİK ALARM";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  drivers: ThreatDriver[];
  metrics: {
    criticalEventsLast1h: number;
    criticalEventsLast24h: number;
    totalEventsLast24h: number;
    recent6hCount: number;
    prior6hCount: number;
    activeHotspotsCount: number;
    corroboratedClustersCount: number;
  };
  temporalTrend: "ESCALATING" | "STABLE" | "DE-ESCALATING";
  calculatedAt: string;
}

const THREAT_LABELS: Record<number, ExplainableThreatAnalysis["threatLabel"]> = {
  1: "DÜŞÜK",
  2: "KONTROL ALTINDA",
  3: "GERİLİM",
  4: "YÜKSEK RİSK",
  5: "KRİTİK ALARM"
};

export function computeExplainableThreat(): ExplainableThreatAnalysis {
  const crit1h = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM events
         WHERE CAST(severity AS INTEGER) >= 4 AND createdAt > ${sqliteIsoNow("-1 hour")}`
      )
      .get() as { cnt: number }
  ).cnt;

  const crit24h = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM events
         WHERE CAST(severity AS INTEGER) >= 4 AND createdAt > ${sqliteIsoNow("-24 hours")}`
      )
      .get() as { cnt: number }
  ).cnt;

  const total24h = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM events WHERE createdAt > ${sqliteIsoNow("-24 hours")}`)
      .get() as { cnt: number }
  ).cnt;

  const recent6h = (
    db
      .prepare(`SELECT COUNT(*) as cnt FROM events WHERE createdAt > ${sqliteIsoNow("-6 hours")}`)
      .get() as { cnt: number }
  ).cnt;

  const prior6h = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM events
         WHERE createdAt > ${sqliteIsoNow("-12 hours")} AND createdAt <= ${sqliteIsoNow("-6 hours")}`
      )
      .get() as { cnt: number }
  ).cnt;

  const distinctLocations = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT ROUND(lat, 1) || ':' || ROUND(lng, 1)) as cnt
         FROM events
         WHERE lat IS NOT NULL AND lng IS NOT NULL AND createdAt > ${sqliteIsoNow("-24 hours")}`
      )
      .get() as { cnt: number }
  ).cnt;

  const clusters = clusterRecentEvents(24);
  const highConfidenceClusters = clusters.filter((c) => c.confidence === "HIGH" || c.confidence === "MEDIUM");

  const drivers: ThreatDriver[] = [];

  // Determine Level & Drivers
  let threatLevel = 1;
  if (crit1h > 10) {
    threatLevel = 5;
    drivers.push({
      factor: "CRITICAL_BURST_1H",
      weight: 5,
      description: `Son 1 saatte yoğun kritik olay akışı (${crit1h} olay)`
    });
  } else if (crit1h > 5) {
    threatLevel = 4;
    drivers.push({
      factor: "HIGH_SEVERITY_1H",
      weight: 4,
      description: `Son 1 saatte yüksek şiddetli olaylar (${crit1h} olay)`
    });
  } else if (crit1h > 2 || crit24h > 8) {
    threatLevel = 3;
    drivers.push({
      factor: "ELEVATED_CONFLICT",
      weight: 3,
      description: `Bölgesel çatışma hareketliliği (${crit24h} kritik olay / 24s)`
    });
  } else if (crit1h > 0 || crit24h > 2) {
    threatLevel = 2;
    drivers.push({
      factor: "MONITORED_TENSION",
      weight: 2,
      description: `İzlenen gerilim sinyalleri (${crit24h} olay / 24s)`
    });
  } else {
    drivers.push({
      factor: "BASELINE_ACTIVITY",
      weight: 1,
      description: "Rutin gözlem seviyesi — aktif acil alarm yok"
    });
  }

  // Temporal Trend Driver
  let temporalTrend: ExplainableThreatAnalysis["temporalTrend"] = "STABLE";
  if (recent6h > prior6h * 1.5 && recent6h >= 4) {
    temporalTrend = "ESCALATING";
    drivers.push({
      factor: "FREQUENCY_SPIKE",
      weight: 2,
      description: `Olay sıklığında ivmelenme (Son 6s: ${recent6h} olay, Önceki 6s: ${prior6h} olay)`
    });
  } else if (recent6h < prior6h * 0.5 && prior6h >= 4) {
    temporalTrend = "DE-ESCALATING";
    drivers.push({
      factor: "ACTIVITY_DOWNTREND",
      weight: -1,
      description: `Olay sıklığında düşüş trendi (Son 6s: ${recent6h} olay)`
    });
  }

  // Geographic Spread Driver
  if (distinctLocations >= 4) {
    drivers.push({
      factor: "GEOGRAPHIC_DISPERSION",
      weight: 2,
      description: `Olaylar ${distinctLocations} farklı coğrafi noktaya dağılmış durumda`
    });
  }

  // Evidence Confidence
  let confidence: ExplainableThreatAnalysis["confidence"] = "LOW";
  if (highConfidenceClusters.length >= 3 || (crit1h >= 2 && highConfidenceClusters.length >= 1)) {
    confidence = "HIGH";
    drivers.push({
      factor: "CORROBORATED_EVIDENCE",
      weight: 2,
      description: `${highConfidenceClusters.length} doğrulanmış çok kaynaklı olay kümesi mevcut`
    });
  } else if (highConfidenceClusters.length >= 1 || total24h >= 5) {
    confidence = "MEDIUM";
  }

  return {
    threatLevel: threatLevel as 1 | 2 | 3 | 4 | 5,
    threatLabel: THREAT_LABELS[threatLevel] ?? "DÜŞÜK",
    confidence,
    drivers,
    metrics: {
      criticalEventsLast1h: crit1h,
      criticalEventsLast24h: crit24h,
      totalEventsLast24h: total24h,
      recent6hCount: recent6h,
      prior6hCount: prior6h,
      activeHotspotsCount: distinctLocations,
      corroboratedClustersCount: highConfidenceClusters.length
    },
    temporalTrend,
    calculatedAt: new Date().toISOString()
  };
}
