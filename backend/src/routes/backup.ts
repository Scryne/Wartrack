import { Router, Request, Response } from "express";
import {
  createBackup,
  listBackups,
  restoreBackup,
  type BackupResult,
  type BackupFileInfo,
  type RestoreResult
} from "../services/backup.service";
import { rateLimit } from "../lib/rateLimit";
import { asyncRoute } from "../lib/http";

const router = Router();

// Mutating endpoints are already gated by requireApiKey at the router level in routes/index.ts.
// In addition, snapshot creation is rate-limited to avoid I/O starvation.
const backupRateLimit = rateLimit({
  max: 5,
  windowMs: 60_000,
  message: "Yedekleme istekleri sınırlandırıldı."
});

/**
 * GET /api/backup/list
 * Returns all available verified SQLite backup snapshots and their metadata.
 */
router.get("/list", (_req: Request, res: Response) => {
  try {
    const backups: BackupFileInfo[] = listBackups();
    return res.json({
      ok: true,
      total: backups.length,
      backups
    });
  } catch (err) {
    console.error("[BACKUP] GET /list error:", err);
    return res.status(500).json({ message: "Yedek listesi alınamadı." });
  }
});

/**
 * POST /api/backup/create
 * Generates an online, consistent WAL-safe SQLite database backup snapshot.
 */
router.post(
  "/create",
  backupRateLimit,
  asyncRoute(async (_req: Request, res: Response) => {
    try {
      const result: BackupResult = await createBackup();
      return res.status(201).json({
        ok: true,
        ...result
      });
    } catch (err) {
      console.error("[BACKUP] POST /create error:", err);
      const errorMessage = err instanceof Error ? err.message : "Yedek oluşturulamadı.";
      return res.status(500).json({ message: errorMessage });
    }
  })
);

/**
 * POST /api/backup/restore
 * Attempts database restoration from a verified snapshot file.
 * Fails closed if the application's active SQLite connection is open.
 */
router.post(
  "/restore",
  backupRateLimit,
  (req: Request, res: Response) => {
    const backupPath = typeof req.body?.backupPath === "string" ? req.body.backupPath.trim() : "";
    const rawTargetDb = req.body?.targetDbPath;

    if (!backupPath) {
      return res.status(400).json({ message: "backupPath is required." });
    }

    // Security Guard: Prohibit client from redirecting restore to arbitrary filesystem locations over HTTP API
    if (rawTargetDb !== undefined && rawTargetDb !== null) {
      return res.status(400).json({
        message: "targetDbPath cannot be overridden via the API. Restores are strictly restricted to the configured application database."
      });
    }

    try {
      const result: RestoreResult = restoreBackup(backupPath);
      return res.json(result);
    } catch (err) {
      console.error("[BACKUP] POST /restore error:", err);
      const errorMessage = err instanceof Error ? err.message : "Geri yükleme başarısız oldu.";
      const isClientError =
        errorMessage.includes("PATH TRAVERSAL") ||
        errorMessage.includes("Invalid backup path") ||
        errorMessage.includes("does not exist");
      return res.status(isClientError ? 400 : 500).json({ message: errorMessage });
    }
  }
);

export default router;
