import { Router, Request, Response } from "express";
import db from "../db";

const router = Router();

/* ───────────────── PREPARED STATEMENTS ───────────────── */

const getAllStmt = db.prepare("SELECT key, value, updatedAt FROM settings");

const getOneStmt = db.prepare("SELECT key, value, updatedAt FROM settings WHERE key = ?");

const upsertStmt = db.prepare(`
  INSERT INTO settings (key, value, updatedAt)
  VALUES (@key, @value, datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value = @value, updatedAt = datetime('now')
`);

/* ───────────────── SEED DEFAULTS ───────────────── */

const DEFAULTS: Record<string, string> = {
  "rss.interval": "5",
  "ai.model": "ollama",
  "ai.autoSummarize": "true",
  "ai.interval": "1",
  "ai.summaryLang": "tr",
  "map.tile": "cartodbDark",
  "threat.sound": "false",
};

const seedDefaults = db.transaction(() => {
  for (const [key, value] of Object.entries(DEFAULTS)) {
    const existing = getOneStmt.get(key);
    if (!existing) {
      upsertStmt.run({ key, value });
    }
  }
});
seedDefaults();

/* ───────────────── GET /api/settings ───────────────── */

router.get("/", (_req: Request, res: Response) => {
  try {
    const rows = getAllStmt.all() as { key: string; value: string; updatedAt: string }[];
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    res.json(settings);
  } catch (err) {
    console.error("[SETTINGS] GET error:", err);
    res.status(500).json({ message: "Settings could not be retrieved." });
  }
});

/* ───────────────── PUT /api/settings/:key ───────────────── */

router.put("/:key", (req: Request, res: Response) => {
  try {
    const key = req.params.key;
    const { value } = req.body;

    if (value === undefined || value === null) {
      res.status(400).json({ message: "value is required." });
      return;
    }

    upsertStmt.run({ key, value: String(value) });

    const io = req.app.get("io");
    if (io) io.emit("settings:updated", { key, value: String(value) });

    res.json({ ok: true, key, value: String(value) });
  } catch (err) {
    console.error("[SETTINGS] PUT error:", err);
    res.status(500).json({ message: "Setting could not be updated." });
  }
});

router.put("/", (req: Request, res: Response) => {
  try {
    if (typeof req.body !== "object" || req.body === null) {
      res.status(400).json({ message: "Body must be an object." });
      return;
    }

    const payload = req.body as Record<string, unknown>;
    for (const [key, value] of Object.entries(payload)) {
      upsertStmt.run({ key, value: String(value) });
    }

    const io = req.app.get("io");
    if (io) io.emit("settings:updated", payload);

    res.json({ ok: true, updated: Object.keys(payload).length });
  } catch (err) {
    console.error("[SETTINGS] BULK PUT error:", err);
    res.status(500).json({ message: "Settings could not be updated." });
  }
});

export default router;
