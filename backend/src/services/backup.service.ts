import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import db, { DATABASE_PATH, PROJECT_ROOT } from "../db";

export interface BackupOptions {
  destinationDir?: string;
  retentionCount?: number;
  sourceDb?: typeof db;
  sourceDbPath?: string;
}

export interface BackupResult {
  backupPath: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  integrityOk: boolean;
  prunedCount: number;
}

export interface RestoreResult {
  ok: boolean;
  restoredFrom: string;
  targetPath: string;
}

export interface BackupFileInfo {
  filename: string;
  filePath: string;
  sizeBytes: number;
  createdAt: string;
}

/**
 * Pluggable Storage Abstraction for Backup Operations.
 * Enables zero-refactor extension to S3 / Object Storage in enterprise production deployments.
 */
export interface IBackupStorage {
  save(tempFilePath: string, finalFilename: string, destDir: string): Promise<string>;
  list(destDir: string): Promise<BackupFileInfo[]>;
  prune(destDir: string, retentionCount: number): Promise<number>;
  verify(filePath: string): Promise<{ ok: boolean; errors?: string[] }>;
}

export class LocalFilesystemStorage implements IBackupStorage {
  save(tempFilePath: string, finalFilename: string, destDir: string): Promise<string> {
    const finalPath = path.join(destDir, finalFilename);
    fs.renameSync(tempFilePath, finalPath);
    return Promise.resolve(finalPath);
  }

  list(destDir: string): Promise<BackupFileInfo[]> {
    return Promise.resolve(listBackups(destDir));
  }

  prune(destDir: string, retentionCount: number): Promise<number> {
    return Promise.resolve(rotateBackups(destDir, retentionCount));
  }

  verify(filePath: string): Promise<{ ok: boolean; errors?: string[] }> {
    return Promise.resolve(verifyBackupIntegrity(filePath));
  }
}

const DEFAULT_BACKUP_DIR = path.join(PROJECT_ROOT, "backups");
const DEFAULT_RETENTION_COUNT = 7;

/** In-process mutex to prevent concurrent backup invocations */
let isBackupInProgress = false;

/**
 * Resolves the active backup directory with security path normalization.
 */
export function resolveBackupDir(customDir?: string): string {
  const target = customDir ?? process.env.BACKUP_DIR ?? DEFAULT_BACKUP_DIR;
  return path.resolve(target);
}

/**
 * Verifies that a SQLite database file exists, is readable, and passes PRAGMA integrity_check.
 */
export function verifyBackupIntegrity(backupPath: string): { ok: boolean; errors?: string[] } {
  const resolved = path.resolve(backupPath);
  if (!fs.existsSync(resolved)) {
    return { ok: false, errors: [`Backup file does not exist: ${resolved}`] };
  }

  let verifyDb: InstanceType<typeof Database> | null = null;
  try {
    verifyDb = new Database(resolved, { readonly: true, fileMustExist: true });
    const rows = verifyDb.pragma("integrity_check") as Array<{ integrity_check: string }>;

    if (!rows || rows.length === 0 || rows[0].integrity_check !== "ok") {
      const issues = rows.map((r) => r.integrity_check);
      return { ok: false, errors: issues };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      errors: [err instanceof Error ? err.message : String(err)]
    };
  } finally {
    if (verifyDb) {
      try {
        verifyDb.close();
      } catch {
        // Ignore close error on readonly verification connection
      }
    }
  }
}

/**
 * Creates a transactional, WAL-safe online backup of the SQLite database.
 * Uses atomic temp-file promotion, in-process concurrency locking,
 * and validates PRAGMA integrity_check before finalizing.
 */
export async function createBackup(options: BackupOptions = {}): Promise<BackupResult> {
  if (isBackupInProgress) {
    throw new Error("Concurrent backup operation in progress. Operation rejected to prevent race conditions.");
  }

  isBackupInProgress = true;

  const destDir = resolveBackupDir(options.destinationDir);
  const retention = options.retentionCount ?? Number(process.env.BACKUP_RETENTION_COUNT ?? DEFAULT_RETENTION_COUNT);
  const activeDb = options.sourceDb ?? db;

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Cleanup any lingering stale .tmp backup files in destination directory
  try {
    const existingEntries = fs.readdirSync(destDir);
    for (const entry of existingEntries) {
      if (entry.startsWith("wartracker-backup-") && entry.endsWith(".tmp")) {
        try {
          fs.unlinkSync(path.join(destDir, entry));
        } catch {
          // ignore stale cleanup errors
        }
      }
    }
  } catch {
    // ignore
  }

  const now = new Date();
  const timestampStr = now.toISOString().replace(/[:.]/g, "-");
  const filename = `wartracker-backup-${timestampStr}.db`;
  const finalPath = path.join(destDir, filename);
  const tempPath = path.join(destDir, `${filename}.tmp`);

  try {
    // 1. Perform online consistent snapshot via better-sqlite3 backup API
    await activeDb.backup(tempPath);

    // 2. Verify integrity of the created snapshot
    const integrity = verifyBackupIntegrity(tempPath);
    if (!integrity.ok) {
      throw new Error(`Backup failed integrity verification: ${integrity.errors?.join(", ")}`);
    }

    // 3. Atomically promote the verified temp file to the final backup file
    fs.renameSync(tempPath, finalPath);

    const stats = fs.statSync(finalPath);

    // 4. Rotate old backups beyond the retention limit
    const prunedCount = rotateBackups(destDir, retention);

    return {
      backupPath: finalPath,
      filename,
      sizeBytes: stats.size,
      createdAt: now.toISOString(),
      integrityOk: true,
      prunedCount
    };
  } catch (err) {
    // Clean up temporary file if leftover
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // Ignore unlink error
      }
    }
    throw err;
  } finally {
    isBackupInProgress = false;
  }
}

/**
 * Rotates backups in destination directory, keeping the most recent `retentionCount` files.
 */
export function rotateBackups(destDir: string, retentionCount: number): number {
  if (!fs.existsSync(destDir) || retentionCount <= 0) return 0;

  const files = listBackups(destDir);
  if (files.length <= retentionCount) return 0;

  const filesToDelete = files.slice(retentionCount);
  let deletedCount = 0;

  for (const file of filesToDelete) {
    try {
      fs.unlinkSync(file.filePath);
      deletedCount++;
    } catch (err) {
      console.error(`[BACKUP] Failed to prune old backup ${file.filePath}:`, err);
    }
  }

  return deletedCount;
}

/**
 * Lists all available backup files in the destination directory, sorted newest to oldest.
 */
export function listBackups(customDir?: string): BackupFileInfo[] {
  const destDir = resolveBackupDir(customDir);
  if (!fs.existsSync(destDir)) return [];

  const entries = fs.readdirSync(destDir);
  const backupFiles = entries
    .filter((name) => name.startsWith("wartracker-backup-") && name.endsWith(".db"))
    .map((name) => {
      const fullPath = path.join(destDir, name);
      const stat = fs.statSync(fullPath);
      return {
        filename: name,
        filePath: fullPath,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return backupFiles;
}

/**
 * Restores a verified backup file to the target database location.
 * Safely removes existing WAL sidecars to ensure snapshot consistency.
 *
 * FAIL-CLOSED SAFETY:
 * Prohibits live in-process database replacement while the application connection is active.
 * Requires offline restore procedure or an unattached target path.
 */
export function restoreBackup(backupPath: string, targetDbPath?: string): RestoreResult {
  const targetPath = targetDbPath ?? DATABASE_PATH;
  const resolvedTarget = path.resolve(targetPath);
  const resolvedBackup = path.resolve(backupPath);

  // 1. FAIL-CLOSED GUARD: Prohibit live restore when targeting active database while db connection is open
  if (resolvedTarget === path.resolve(DATABASE_PATH) && db.open) {
    throw new Error(
      "FAIL-CLOSED RESTORE ERROR: Live database restore is strictly prohibited while the active application holds an open database connection. You must stop the application before restoring."
    );
  }

  // 2. Verify backup integrity before attempting restore
  const integrity = verifyBackupIntegrity(resolvedBackup);
  if (!integrity.ok) {
    throw new Error(`Cannot restore corrupted or invalid backup: ${integrity.errors?.join(", ")}`);
  }

  const targetDir = path.dirname(resolvedTarget);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 3. Staging backup of existing target file for rollback safety
  const safetyBackupPath = `${resolvedTarget}.pre-restore.bak`;
  const hadExisting = fs.existsSync(resolvedTarget);
  if (hadExisting) {
    try {
      fs.copyFileSync(resolvedTarget, safetyBackupPath);
    } catch {
      // ignore
    }
  }

  const walPath = `${resolvedTarget}-wal`;
  const shmPath = `${resolvedTarget}-shm`;

  try {
    // 4. Remove lingering WAL and SHM sidecars at target
    if (fs.existsSync(walPath)) {
      try {
        fs.unlinkSync(walPath);
      } catch (err) {
        throw new Error(`Cannot remove active WAL sidecar during restore: ${String(err)}`, { cause: err });
      }
    }
    if (fs.existsSync(shmPath)) {
      try {
        fs.unlinkSync(shmPath);
      } catch (err) {
        throw new Error(`Cannot remove active SHM sidecar during restore: ${String(err)}`, { cause: err });
      }
    }

    // 5. Copy verified backup to target
    fs.copyFileSync(resolvedBackup, resolvedTarget);

    // 6. Verify target database integrity post-copy
    const postCheck = verifyBackupIntegrity(resolvedTarget);
    if (!postCheck.ok) {
      throw new Error(`Restored database failed integrity check: ${postCheck.errors?.join(", ")}`);
    }

    // Clean up temporary safety backup
    if (fs.existsSync(safetyBackupPath)) {
      try {
        fs.unlinkSync(safetyBackupPath);
      } catch {
        // ignore
      }
    }

    return {
      ok: true,
      restoredFrom: resolvedBackup,
      targetPath: resolvedTarget
    };
  } catch (err) {
    // Roll back to pre-restore state if available
    if (hadExisting && fs.existsSync(safetyBackupPath)) {
      try {
        fs.copyFileSync(safetyBackupPath, resolvedTarget);
        fs.unlinkSync(safetyBackupPath);
      } catch {
        // ignore rollback cleanup errors
      }
    }
    throw err;
  }
}
