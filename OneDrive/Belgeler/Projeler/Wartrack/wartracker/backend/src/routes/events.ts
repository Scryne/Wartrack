import { Router, Request, Response } from "express";
import db from "../db";

const router = Router();

/* ───────────────── KEYWORD → SEVERITY MAP ───────────────── */

const KEYWORD_SEVERITY: [RegExp, number][] = [
  [/nuclear|nükleer|reactor|uranium enrichment|atom/i, 5],
  [/ballistic|missile|füze|rocket|drone strike|airstrike|air strike|intercept/i, 4],
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

const insertEventStmt = db.prepare(`
  INSERT INTO events (articleId, type, title, description, severity, source, lat, lng)
  VALUES (@articleId, @type, @title, @description, @severity, @source, @lat, @lng)
`);

const deleteEventStmt = db.prepare(`DELETE FROM events WHERE id = @id`);

db.prepare("DELETE FROM events WHERE CAST(severity AS INTEGER) < 3").run();

/* ───────────────── GET /api/events ───────────────── */

router.get("/", (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (req.query.type) {
      conditions.push("type = @type");
      params.type = req.query.type;
    }
    if (req.query.severity) {
      conditions.push("severity = @severity");
      params.severity = req.query.severity;
    }
    if (req.query.minSeverity) {
      conditions.push("CAST(severity AS INTEGER) >= @minSeverity");
      params.minSeverity = Number(req.query.minSeverity);
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
    console.error("[EVENTS] GET error:", err);
    res.status(500).json({ message: "Events could not be retrieved." });
  }
});

/* ───────────────── POST /api/events ───────────────── */

router.post("/", (req: Request, res: Response) => {
  try {
    const { type, title, description, severity, source, lat, lng } = req.body;
    if (!type || !title) {
      res.status(400).json({ message: "type and title are required." });
      return;
    }

    const result = insertEventStmt.run({
      articleId: null,
      type,
      title,
      description: description ?? null,
      severity: String(severity ?? detectSeverity(title)),
      source: source ?? null,
      lat: lat ?? null,
      lng: lng ?? null,
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
    const result = deleteEventStmt.run({ id: Number(req.params.id) });
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
    SELECT id, title, description, source, lat, lng
    FROM articles
    WHERE createdAt > datetime('now', '-2 day')
      AND NOT EXISTS (
        SELECT 1 FROM events e WHERE e.articleId = articles.id
      )
  `).all() as { id: number; title: string; description: string | null; source: string; lat: number | null; lng: number | null }[];

  let created = 0;

  for (const article of recentArticles) {
    const text = `${article.title} ${article.description ?? ""}`;
    const severity = detectSeverity(text);

    if (severity < 3) {
      console.info("[EVENTS] Düşük öncelikli, kaydedilmedi:", article.title);
      continue;
    }

    let type = "genel";
    if (severity >= 4) type = "kritik";
    else if (severity >= 3) type = "çatışma";
    else if (severity >= 2) type = "hareket";

    const result = insertEventStmt.run({
      articleId: article.id,
      type,
      title: article.title,
      description: article.description ?? null,
      severity: String(severity),
      source: article.source ?? null,
      lat: article.lat ?? null,
      lng: article.lng ?? null,
    });

    if (result.changes > 0) {
      created++;

      if (io) {
        const inserted = db
          .prepare("SELECT * FROM events WHERE id = ?")
          .get(result.lastInsertRowid);
        io.emit("event:new", inserted);
      }
    }
  }

  if (created > 0 && io) {
    io.emit("stats:update");
  }

  console.warn(`[EVENTS] Auto-extract: ${created} new events from ${recentArticles.length} articles`);
  return created;
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

/* ───────────────── GET /api/events/stats ───────────────── */

router.get("/stats", (_req: Request, res: Response) => {
  try {
    const todayArticles = db
      .prepare("SELECT COUNT(*) as cnt FROM articles WHERE date(createdAt) = date('now')")
      .get() as { cnt: number };

    const last24hEvents = db
      .prepare("SELECT COUNT(*) as cnt FROM events WHERE createdAt > datetime('now', '-1 day')")
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
