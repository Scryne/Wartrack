import { Router } from "express";
import pinsRouter from "./pins";
import feedRouter from "./feed";
import summarizeRouter from "./summarize";
import eventsRouter from "./events";
import settingsRouter from "./settings";
import bookmarksRouter from "./bookmarks";
import backupRouter from "./backup";
import { requireApiKey } from "../lib/auth";

import db from "../db";
import { jobMetrics } from "../lib/jobMetrics";
import { listBackups } from "../services/backup.service";

const router = Router();

// Mounted on the router rather than in index.ts so that anything mounting this
// router — the server and the test app alike — is gated identically.
// No-ops for GET/HEAD/OPTIONS; only mutating methods require the key.
router.use(requireApiKey);

const pingStmt = db.prepare("SELECT 1 as ping");

// Liveness probe — fast, lightweight, does not touch external resources
router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "wartracker-backend",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// Readiness probe — verifies database connectivity
router.get("/ready", (_req, res) => {
  try {
    const result = pingStmt.get() as { ping: number } | undefined;
    if (result?.ping === 1) {
      return res.json({ ok: true, database: true });
    }
    return res.status(503).json({ ok: false, database: false });
  } catch {
    return res.status(503).json({ ok: false, database: false });
  }
});

// Detailed operational diagnostics (latency, memory, scheduler, backups)
router.get("/diagnostics", (_req, res) => {
  const start = performance.now();
  let dbOk: boolean;
  try {
    const result = pingStmt.get() as { ping: number } | undefined;
    dbOk = result?.ping === 1;
  } catch {
    dbOk = false;
  }
  const dbLatencyMs = Number((performance.now() - start).toFixed(2));
  const mem = process.memoryUsage();

  let backupCount = 0;
  let lastBackupAt: string | null = null;
  try {
    const backups = listBackups();
    backupCount = backups.length;
    lastBackupAt = backups[0]?.createdAt ?? null;
  } catch {
    // Non-fatal if backup directory is uninitialized
  }

  res.json({
    ok: dbOk,
    service: "wartracker-backend",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: {
      ok: dbOk,
      latencyMs: dbLatencyMs
    },
    memory: {
      rssMb: Number((mem.rss / (1024 * 1024)).toFixed(2)),
      heapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(2))
    },
    jobs: jobMetrics,
    backups: {
      total: backupCount,
      lastBackupAt
    }
  });
});

router.use("/pins", pinsRouter);
router.use("/feed", feedRouter);
router.use("/summarize", summarizeRouter);
router.use("/events", eventsRouter);
router.use("/settings", settingsRouter);
router.use("/bookmarks", bookmarksRouter);
router.use("/backup", backupRouter);

export default router;
