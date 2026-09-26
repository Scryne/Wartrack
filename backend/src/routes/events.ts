import { Router, Request, Response } from "express";
import db from "../db";
import { sqliteIsoNow } from "../lib/time";
import { QueryParamError, optionalInt, optionalString } from "../lib/queryParams";

const router = Router();

/* ───────────────── KEYWORD → SEVERITY MAP ───────────────── */

const KEYWORD_SEVERITY: [RegExp, number][] = [
  [/nuclear|nükleer|reactor|uranium enrichment|atom/i, 5],
  // "intercept" only counts next to a projectile: on its own it also matched
  // police stories ("Illegal Negev camel race intercepted") as severity 4.
  [/ballistic|missile|füze|rocket|drone strike|airstrike|air strike|intercept\w*\b[^.]{0,60}\b(?:drone|projectile|uav)|(?:drone|projectile|uav)s?\b[^.]{0,60}\bintercept/i, 4],
  [/attack|saldırı|raid|clash|çatışma|explosion|patlama/i, 3],
  [/movement|deployment|mobilization|intikal|hareket/i, 2],
];

function detectSeverity(text: string): number {
  for (const [re, sev] of KEYWORD_SEVERITY) {
    if (re.test(text)) return sev;
  }
  return 1;
}

/* ───────────────── PREPARED STATEMENTS ───────────────── */

// INSERT OR IGNORE: events.articleId carries a UNIQUE partial index, and the
// "not yet linked" check in autoExtractEvents is a check-then-act that races
// against a concurrent cron run. Without this, the constraint violation throws
// and aborts the remaining articles in the batch.
const insertEventStmt = db.prepare(`
  INSERT OR IGNORE INTO events (articleId, type, title, description, severity, source, lat, lng)
  VALUES (@articleId, @type, @title, @description, @severity, @source, @lat, @lng)
`);

// Auto-extracted events are dated by when the source says it happened, not by
// when this process read the feed. Ingestion time made every backlog look like
// a live attack: after the dashboard had been off for a month, one catch-up RSS
// cycle dated 33 old stories "last hour" and the threat meter read 5 / KRİTİK.
const insertAutoEventStmt = db.prepare(`
  INSERT OR IGNORE INTO events (articleId, type, title, description, severity, source, lat, lng, createdAt)
  VALUES (@articleId, @type, @title, @description, @severity, @source, @lat, @lng, @createdAt)
`);

/** An article's publication time, never later than now (feeds misdate items). */
export function eventTimeFromPubDate(pubDate: string | null, now: Date = new Date()): string {
  const nowIso = now.toISOString();
  if (!pubDate) return nowIso;
  const parsed = new Date(pubDate);
  if (Number.isNaN(parsed.getTime())) return nowIso;
  const iso = parsed.toISOString();
  return iso < nowIso ? iso : nowIso;
}

const deleteEventStmt = db.prepare(`DELETE FROM events WHERE id = @id`);

// The one-shot prune of severity < 3 events now lives in migration 3.
// It used to run here at module scope, i.e. on every import.

/* ───────────────── PAYLOAD VALIDATION ───────────────── */

const MAX_TEXT_LENGTH = 2_000;

interface EventPayload {
  type: string;
  title: string;
  description: string | null;
  severity: string;
  source: string | null;
  lat: number | null;
  lng: number | null;
}

/** Previously severity, lat and lng were written through unvalidated. */
function validateEventPayload(body: unknown): { data?: EventPayload; error?: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Invalid payload." };
  }

  const candidate = body as Record<string, unknown>;
  const type = typeof candidate.type === "string" ? candidate.type.trim() : "";
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";

  if (!type || !title) {
    return { error: "type and title are required." };
  }
  if (type.length > 64 || title.length > MAX_TEXT_LENGTH) {
    return { error: "type or title is too long." };
  }

  const description =
    typeof candidate.description === "string"
      ? candidate.description.trim().slice(0, MAX_TEXT_LENGTH)
      : null;
  const source =
    typeof candidate.source === "string" ? candidate.source.trim().slice(0, 128) : null;

  let severity: number;
  if (candidate.severity === undefined || candidate.severity === null) {
    severity = detectSeverity(title);
  } else {
    severity = Number(candidate.severity);
    if (!Number.isInteger(severity) || severity < 1 || severity > 5) {
      return { error: "severity must be an integer between 1 and 5." };
    }
  }

  // Coordinates are optional, but must be a valid pair within real bounds.
  const hasLat = candidate.lat !== undefined && candidate.lat !== null;
  const hasLng = candidate.lng !== undefined && candidate.lng !== null;

  if (hasLat !== hasLng) {
    return { error: "lat and lng must be provided together." };
  }

  let lat: number | null = null;
  let lng: number | null = null;

  if (hasLat && hasLng) {
    lat = Number(candidate.lat);
    lng = Number(candidate.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return { error: "lat must be between -90 and 90." };
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      return { error: "lng must be between -180 and 180." };
    }
  }

  return {
    data: { type, title, description, severity: String(severity), source, lat, lng }
  };
}

/* ───────────────── GET /api/events ───────────────── */

router.get("/", (req: Request, res: Response) => {
  try {
    const limit = optionalInt(req.query.limit, "limit", { fallback: 50, min: 1, max: 200 });
    const offset = optionalInt(req.query.offset, "offset", {
      fallback: 0,
      min: 0,
      max: 1_000_000
    });

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    const type = optionalString(req.query.type, "type");
    if (type !== undefined) {
      conditions.push("type = @type");
      params.type = type;
    }

    const severity = optionalString(req.query.severity, "severity");
    if (severity !== undefined) {
      conditions.push("severity = @severity");
      params.severity = severity;
    }

    // minSeverity used to bind Number("abc") === NaN, which SQLite compares as
    // NULL: the filter matched nothing and the caller got an empty list with a
    // 200, indistinguishable from "no such events".
    if (req.query.minSeverity !== undefined) {
      conditions.push("CAST(severity AS INTEGER) >= @minSeverity");
      params.minSeverity = optionalInt(req.query.minSeverity, "minSeverity", {
        fallback: 1,
        min: 1,
        max: 5
      });
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const rows = db
      .prepare(
        `SELECT * FROM events ${where}
         ORDER BY createdAt DESC
         LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit, offset });

    const totalRow = db
      .prepare(`SELECT COUNT(*) as total FROM events ${where}`)
      .get(params) as { total: number };

    res.json({ data: rows, total: totalRow.total, limit, offset });
  } catch (err) {
    if (err instanceof QueryParamError) {
      res.status(400).json({ message: err.message });
      return;
    }
    console.error("[EVENTS] GET error:", err);
    res.status(500).json({ message: "Events could not be retrieved." });
  }
});

/* ───────────────── POST /api/events ───────────────── */

router.post("/", (req: Request, res: Response) => {
  try {
    const validation = validateEventPayload(req.body);
    if (!validation.data) {
      res.status(400).json({ message: validation.error });
      return;
    }

    const result = insertEventStmt.run({
      articleId: null,
      ...validation.data,
    });

    const inserted = db
      .prepare("SELECT * FROM events WHERE id = ?")
      .get(result.lastInsertRowid);

    // Emit via socket
    const io = req.app.get("io");
    if (io) {
      io.emit("event:new", inserted);
      io.emit("stats:update");
    }

    res.status(201).json(inserted);
  } catch (err) {
    console.error("[EVENTS] POST error:", err);
    res.status(500).json({ message: "Event could not be created." });
  }
});

/* ───────────────── DELETE /api/events/:id ───────────────── */

router.delete("/:id", (req: Request, res: Response) => {
  try {
    // DELETE /api/events/abc bound NaN and reported "Event not found", telling
    // the caller the id was valid but absent. It was never a valid id.
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ message: "Event id is invalid." });
      return;
    }

    const result = deleteEventStmt.run({ id });
    if (result.changes === 0) {
      res.status(404).json({ message: "Event not found." });
      return;
    }

    const io = req.app.get("io");
    if (io) io.emit("stats:update");

    res.json({ ok: true });
  } catch (err) {
    console.error("[EVENTS] DELETE error:", err);
    res.status(500).json({ message: "Event could not be deleted." });
  }
});

/* ───────────────── POST /api/events/auto ───────────────── */

export function autoExtractEvents(io?: { emit: (ev: string, data?: unknown) => void }): number {
  // Scan recent articles that are not linked to an event yet
  const recentArticles = db.prepare(`
    SELECT id, title, description, source, lat, lng, pubDate
    FROM articles
    WHERE createdAt > ${sqliteIsoNow("-2 days")}
      -- Only stories placed in the theatre become events. Keyword severity on
      -- world feeds turned "hits back at Trump attack" (a museum dispute in
      -- Washington) into a regional conflict event.
      AND lat IS NOT NULL AND lng IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM events e WHERE e.articleId = articles.id
      )
  `).all() as {
    id: number;
    title: string;
    description: string | null;
    source: string;
    lat: number | null;
    lng: number | null;
    pubDate: string | null;
  }[];

  const insertedEvents: unknown[] = [];

  // One transaction for the whole batch: a partial apply would otherwise
  // leave the caller with no record of where it stopped.
  const extractBatch = db.transaction(() => {
    for (const article of recentArticles) {
      const text = `${article.title} ${article.description ?? ""}`;
      const severity = detectSeverity(text);

      if (severity < 3) {
        continue;
      }

      // severity is >= 3 here, so only these two arms are reachable.
      const type = severity >= 4 ? "kritik" : "çatışma";

      const result = insertAutoEventStmt.run({
        articleId: article.id,
        type,
        title: article.title,
        description: article.description ?? null,
        severity: String(severity),
        source: article.source ?? null,
        lat: article.lat ?? null,
        lng: article.lng ?? null,
        createdAt: eventTimeFromPubDate(article.pubDate),
      });

      // changes === 0 means OR IGNORE skipped an already-linked article.
      if (result.changes > 0) {
        insertedEvents.push(
          db.prepare("SELECT * FROM events WHERE id = ?").get(result.lastInsertRowid)
        );
      }
    }
  });

  extractBatch();

  if (io) {
    for (const inserted of insertedEvents) {
      io.emit("event:new", inserted);
    }
    if (insertedEvents.length > 0) {
      io.emit("stats:update");
    }
  }

  console.info(
    `[EVENTS] Auto-extract: ${insertedEvents.length} new events from ${recentArticles.length} articles`
  );
  return insertedEvents.length;
}

router.post("/auto", (req: Request, res: Response) => {
  try {
    const io = req.app.get("io");
    const created = autoExtractEvents(io);
    res.json({ ok: true, created });
  } catch (err) {
    console.error("[EVENTS] POST /auto error:", err);
    res.status(500).json({ message: "Auto-extraction failed." });
  }
});

import { clusterRecentEvents, CorroboratedCluster } from "../services/corroboration.service";
import { computeExplainableThreat, ExplainableThreatAnalysis } from "../services/threat.service";

/* ───────────────── GET /api/events/threat-analysis ───────────────── */

router.get("/threat-analysis", (_req: Request, res: Response) => {
  try {
    const analysis = computeExplainableThreat();
    res.json(analysis);
  } catch (err) {
    console.error("[EVENTS] GET /threat-analysis error:", err);
    res.status(500).json({ message: "Threat analysis could not be computed." });
  }
});

/* ───────────────── GET /api/events/clusters ───────────────── */

router.get("/clusters", (req: Request, res: Response) => {
  try {
    const hours = optionalInt(req.query.hours, "hours", { fallback: 24, min: 1, max: 168 });
    const clusters = clusterRecentEvents(hours);
    res.json({
      hours,
      totalClusters: clusters.length,
      clusters
    });
  } catch (err) {
    if (err instanceof QueryParamError) {
      return res.status(400).json({ message: err.message });
    }
    console.error("[EVENTS] GET /clusters error:", err);
    return res.status(500).json({ message: "Event clusters could not be generated." });
  }
});

/* ───────────────── GET /api/events/timeline ───────────────── */

router.get("/timeline", (req: Request, res: Response) => {
  try {
    const hours = optionalInt(req.query.hours, "hours", { fallback: 24, min: 1, max: 168 });
    const cutoffIso = new Date(Date.now() - hours * 3_600_000).toISOString();

    const rows = db
      .prepare(
        `SELECT strftime('%Y-%m-%dT%H:00:00.000Z', createdAt) as bucket,
                COUNT(*) as count,
                MAX(CAST(severity AS INTEGER)) as maxSeverity
         FROM events
         WHERE createdAt > ?
         GROUP BY bucket
         ORDER BY bucket ASC`
      )
      .all(cutoffIso) as { bucket: string; count: number; maxSeverity: number }[];

    res.json({
      hours,
      timeline: rows
    });
  } catch (err) {
    if (err instanceof QueryParamError) {
      return res.status(400).json({ message: err.message });
    }
    console.error("[EVENTS] GET /timeline error:", err);
    return res.status(500).json({ message: "Timeline could not be generated." });
  }
});

/* ───────────────── GET /api/events/sitrep (SitRep V2) ───────────────── */

interface SitRepEventRow {
  id: number;
  articleId: number | null;
  type: string;
  title: string;
  description: string | null;
  severity: string;
  source: string | null;
  lat: number | null;
  lng: number | null;
  createdAt: string;
}

interface SitRepPinRow {
  id: number;
  lat: number;
  lng: number;
  title: string;
  description: string | null;
  category: string;
}

function formatSitRepMarkdownV2(data: {
  generatedAt: string;
  hours: number;
  threatAnalysis: ExplainableThreatAnalysis;
  articlesCount: number;
  priorArticlesCount: number;
  eventsCount: number;
  priorEventsCount: number;
  clusters: CorroboratedCluster[];
  events: SitRepEventRow[];
  pins: SitRepPinRow[];
}): string {
  const critical = data.events.filter((e) => Number(e.severity) >= 4);
  const conflict = data.events.filter((e) => Number(e.severity) === 3);

  const eventDelta = data.eventsCount - data.priorEventsCount;
  const eventDeltaStr = eventDelta >= 0 ? `+${eventDelta}` : `${eventDelta}`;
  const trendLabel =
    data.threatAnalysis.temporalTrend === "ESCALATING"
      ? "İVMELENME / YÜKSELİŞ"
      : data.threatAnalysis.temporalTrend === "DE-ESCALATING"
        ? "DÜŞÜŞ TRENDİ"
        : "STABİL";

  let md = `# WARTRACKER STRATEJİK & OPERASYONEL DURUM RAPORU (SITREP V2)
**Tarih / Saat (UTC):** ${data.generatedAt}
**Rapor Penceresi:** Son ${data.hours} saatlik operasyonel tiyatro
**Aktif Tehdit Seviyesi:** SEVİYE ${data.threatAnalysis.threatLevel} — ${data.threatAnalysis.threatLabel} (Trend: ${trendLabel})
**Kanıt Güvenlik Derecesi:** ${data.threatAnalysis.confidence} GÜVEN

---

## 1. YÖNETİCİ ÖZETİ & TEHDİT SÜRÜCÜLERİ
`;

  for (const driver of data.threatAnalysis.drivers) {
    md += `- **[${driver.factor}]** ${driver.description}\n`;
  }

  md += `
---

## 2. DÖNEMSEL DEĞİŞİM & İSTİHBARAT DELTASI (SON ${data.hours}s vs ÖNCEKİ ${data.hours}s)
- **Haber / Kaynak Akışı:** ${data.articlesCount} makale (Önceki dönem: ${data.priorArticlesCount})
- **Kaydedilen Olay Sayısı:** ${data.eventsCount} olay (Değişim: **${eventDeltaStr}**)
- **Kritik Olaylar (Şiddet ≥ 4):** ${critical.length} olay
- **Doğrulanmış Olay Kümeleri:** ${data.clusters.length} küme
- **Aktif Taktik Koordinat Noktaları:** ${data.pins.length} pin

---

## 3. DOĞRULANMIŞ ÇOK KAYNAKLI OLAY KÜMELERİ & ÇAPRAZ KANIT
`;

  if (data.clusters.length === 0) {
    md += "_Bu pencerede çok kaynaklı kümelenmiş olay bulunmuyor._\n\n";
  } else {
    for (const cluster of data.clusters.slice(0, 10)) {
      const conflictTag = cluster.conflictingReports ? " [⚠️ ÇELİŞKİLİ RAPORLAR]" : "";
      md += `### [${cluster.confidence} GÜVEN] ${cluster.primaryEvent.title}${conflictTag}\n`;
      md += `- **Kaynaklar (${cluster.independentSourceCount} Bağımsız Kaynak):** ${cluster.sources.join(", ") || "Açık Kaynak"}\n`;
      md += `- **Zaman Aralığı:** ${cluster.firstReportedAt} → ${cluster.lastReportedAt}\n`;
      if (cluster.primaryEvent.lat !== null && cluster.primaryEvent.lng !== null) {
        md += `- **Koordinat:** ${cluster.primaryEvent.lat.toFixed(4)}, ${cluster.primaryEvent.lng.toFixed(4)}\n`;
      }
      md += `\n`;
    }
  }

  md += `---

## 4. KRİTİK VE YÜKSEK ŞİDDET GELİŞMELERİ (ŞİDDET ≥ 4)
`;

  if (critical.length === 0) {
    md += "_Bu pencerede raporlanmış şiddet ≥ 4 kritik olay bulunmuyor._\n\n";
  } else {
    for (const ev of critical) {
      const coordStr =
        typeof ev.lat === "number" && typeof ev.lng === "number"
          ? ` [Konum: ${ev.lat.toFixed(4)}, ${ev.lng.toFixed(4)}]`
          : "";
      md += `- **[ŞİDDET ${ev.severity}] ${ev.title}** (${ev.source ?? "Açık Kaynak"}${coordStr} · ${ev.createdAt})\n`;
      if (ev.description) {
        md += `  > ${ev.description.replace(/\n+/g, " ")}\n`;
      }
    }
    md += "\n";
  }

  md += `---

## 5. SAHA ÇATIŞMA & HAREKETLİLİK (ŞİDDET 3)
`;

  if (conflict.length === 0) {
    md += "_Bu pencerede kaydedilen orta şiddetli çatışma olayı yok._\n\n";
  } else {
    for (const ev of conflict.slice(0, 15)) {
      const coordStr =
        typeof ev.lat === "number" && typeof ev.lng === "number"
          ? ` [${ev.lat.toFixed(4)}, ${ev.lng.toFixed(4)}]`
          : "";
      md += `- **[${ev.type.toUpperCase()}]** ${ev.title} (${ev.source ?? "Kaynak"}${coordStr})\n`;
    }
    if (conflict.length > 15) {
      md += `  _...ve ${conflict.length - 15} diğer olay._\n`;
    }
    md += "\n";
  }

  md += `---

## 6. İŞARETLENMİŞ TAKTİK VE STRATEJİK NOKTALAR
`;

  if (data.pins.length === 0) {
    md += "_Haritada aktif taktik pin bulunmamaktadır._\n";
  } else {
    for (const pin of data.pins) {
      md += `- **[${pin.category.toUpperCase()}] ${pin.title}** (${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)})\n`;
      if (pin.description) {
        md += `  _${pin.description}_\n`;
      }
    }
  }

  md += `\n---\n*Rapor WarTracker Intelligence Engine tarafından kanıta dayalı (grounded) olarak üretilmiştir.*`;
  return md;
}

router.get("/sitrep", (req: Request, res: Response) => {
  try {
    const hours = optionalInt(req.query.hours, "hours", { fallback: 24, min: 1, max: 168 });
    const format = optionalString(req.query.format, "format")?.toLowerCase() === "json" ? "json" : "markdown";

    const cutoffIso = new Date(Date.now() - hours * 3_600_000).toISOString();
    const priorCutoffIso = new Date(Date.now() - hours * 2 * 3_600_000).toISOString();

    const events = db
      .prepare(
        `SELECT id, articleId, type, title, description, severity, source, lat, lng, createdAt
         FROM events
         WHERE createdAt > ?
         ORDER BY CAST(severity AS INTEGER) DESC, createdAt DESC
         LIMIT 100`
      )
      .all(cutoffIso) as SitRepEventRow[];

    const priorEventsCount = (
      db
        .prepare(
          `SELECT COUNT(*) as cnt FROM events
           WHERE createdAt > ? AND createdAt <= ?`
        )
        .get(priorCutoffIso, cutoffIso) as { cnt: number }
    ).cnt;

    const articlesCountRow = db
      .prepare(`SELECT COUNT(*) as cnt FROM articles WHERE createdAt > ?`)
      .get(cutoffIso) as { cnt: number };

    const priorArticlesCountRow = db
      .prepare(`SELECT COUNT(*) as cnt FROM articles WHERE createdAt > ? AND createdAt <= ?`)
      .get(priorCutoffIso, cutoffIso) as { cnt: number };

    const pins = db
      .prepare(`SELECT id, lat, lng, title, description, category FROM pins ORDER BY id DESC LIMIT 50`)
      .all() as SitRepPinRow[];

    const clusters = clusterRecentEvents(hours);
    const threatAnalysis = computeExplainableThreat();

    const payload = {
      generatedAt: new Date().toISOString(),
      hours,
      threatAnalysis,
      threatLevel: threatAnalysis.threatLevel,
      threatLabel: threatAnalysis.threatLabel,
      articlesCount: articlesCountRow.cnt,
      priorArticlesCount: priorArticlesCountRow.cnt,
      eventsCount: events.length,
      priorEventsCount,
      clusters,
      events,
      pins
    };

    if (format === "json") {
      return res.json(payload);
    }

    const markdown = formatSitRepMarkdownV2(payload);
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="WARTRACKER-SITREP-${Date.now()}.md"`);
    return res.send(markdown);
  } catch (err) {
    if (err instanceof QueryParamError) {
      return res.status(400).json({ message: err.message });
    }
    console.error("[EVENTS] GET /sitrep error:", err);
    return res.status(500).json({ message: "SitRep could not be generated." });
  }
});

/* ───────────────── GET /api/events/stats ───────────────── */

router.get("/stats", (_req: Request, res: Response) => {
  try {
    const todayArticles = db
      .prepare(`SELECT COUNT(*) as cnt FROM articles WHERE date(createdAt) = date(${sqliteIsoNow()})`)
      .get() as { cnt: number };

    const last24hEvents = db
      .prepare(`SELECT COUNT(*) as cnt FROM events WHERE createdAt > ${sqliteIsoNow("-1 day")}`)
      .get() as { cnt: number };

    const totalPins = db
      .prepare("SELECT COUNT(*) as cnt FROM pins")
      .get() as { cnt: number };

    const summarizedArticles = db
      .prepare("SELECT COUNT(*) as cnt FROM articles WHERE aiSummary IS NOT NULL AND aiSummary != ''")
      .get() as { cnt: number };

    res.json({
      articles: todayArticles.cnt,
      events: last24hEvents.cnt,
      pins: totalPins.cnt,
      summaries: summarizedArticles.cnt,
    });
  } catch (err) {
    console.error("[EVENTS] GET /stats error:", err);
    res.status(500).json({ message: "Stats could not be retrieved." });
  }
});

export default router;
