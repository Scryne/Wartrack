import { Router, Request, Response } from "express";
import db from "../db";
import { sqliteIsoNow } from "../lib/time";
import { rateLimit } from "../lib/rateLimit";

const router = Router();

/* ───────────────── PREPARED STATEMENTS ───────────────── */

const getAllStmt = db.prepare("SELECT key, value, updatedAt FROM settings");

const getOneStmt = db.prepare("SELECT key, value, updatedAt FROM settings WHERE key = ?");

const upsertStmt = db.prepare(`
  INSERT INTO settings (key, value, updatedAt)
  VALUES (@key, @value, ${sqliteIsoNow()})
  ON CONFLICT(key) DO UPDATE SET value = @value, updatedAt = ${sqliteIsoNow()}
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

/**
 * Only known keys are writable. Previously any key was accepted, so the table
 * grew without bound and rss.interval / ai.interval — which drive the cron —
 * were settable by any anonymous caller.
 */
const ALLOWED_KEYS = new Set(Object.keys(DEFAULTS));

const MAX_VALUE_LENGTH = 512;

function validateSetting(key: string, rawValue: unknown): { value?: string; error?: string } {
  if (!ALLOWED_KEYS.has(key)) {
    return { error: `Unknown setting key: ${key}` };
  }
  if (rawValue === undefined || rawValue === null) {
    return { error: "value is required." };
  }
  if (typeof rawValue === "object") {
    return { error: "value must be a scalar." };
  }

  const value = String(rawValue);
  if (value.length > MAX_VALUE_LENGTH) {
    return { error: "value is too long." };
  }

  // Interval keys feed the scheduler; clamp them to the same range
  // getNumberSetting enforces so a bad write cannot wedge the cron.
  if (key === "rss.interval" || key === "ai.interval") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 60) {
      return { error: `${key} must be a number between 1 and 60.` };
    }
    return { value: String(Math.floor(parsed)) };
  }

  if (key === "ai.model" && !["ollama", "gemini"].includes(value.toLowerCase())) {
    return { error: "ai.model must be 'ollama' or 'gemini'." };
  }

  return { value };
}

const settingsWriteRateLimit = rateLimit({ max: 30, windowMs: 60_000 });

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

router.put("/:key", settingsWriteRateLimit, (req: Request, res: Response) => {
  try {
    const key = req.params.key;
    const validation = validateSetting(key, req.body?.value);

    if (validation.value === undefined) {
      res.status(400).json({ message: validation.error });
      return;
    }

    upsertStmt.run({ key, value: validation.value });

    const io = req.app.get("io");
    if (io) io.emit("settings:updated", { key, value: validation.value });

    res.json({ ok: true, key, value: validation.value });
  } catch (err) {
    console.error("[SETTINGS] PUT error:", err);
    res.status(500).json({ message: "Setting could not be updated." });
  }
});

router.put("/", settingsWriteRateLimit, (req: Request, res: Response) => {
  try {
    if (typeof req.body !== "object" || req.body === null || Array.isArray(req.body)) {
      res.status(400).json({ message: "Body must be an object." });
      return;
    }

    const payload = req.body as Record<string, unknown>;
    const accepted: Record<string, string> = {};

    for (const [key, value] of Object.entries(payload)) {
      const validation = validateSetting(key, value);
      if (validation.value === undefined) {
        res.status(400).json({ message: validation.error });
        return;
      }
      accepted[key] = validation.value;
    }

    // Validate everything before writing anything, so a bad key in the middle
    // of a bulk update cannot leave a partially-applied change.
    const applyAll = db.transaction(() => {
      for (const [key, value] of Object.entries(accepted)) {
        upsertStmt.run({ key, value });
      }
    });
    applyAll();

    const io = req.app.get("io");
    if (io) io.emit("settings:updated", accepted);

    res.json({ ok: true, updated: Object.keys(accepted).length });
  } catch (err) {
    console.error("[SETTINGS] BULK PUT error:", err);
    res.status(500).json({ message: "Settings could not be updated." });
  }
});

export default router;
