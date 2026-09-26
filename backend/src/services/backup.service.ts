import fs from "fs";
import path from "path";
import crypto from "crypto";
import Database from "better-sqlite3";
import db, { DATABASE_PATH, PROJECT_ROOT } from "../db";

export interface BackupOptions {
  destinationDir?: string;
  retentionCount?: number;
  sourceDb?: typeof db;
  sourceDbPath?: string;
}

export interface BackupMetadata {
  filename: string;
  sizeBytes: number;
  sha256Checksum: string;
  createdAt: string;
  databaseSchemaVersion: number;
  applicationVersion: string;
  corroborationAlgorithmVersion: string;
  tablesSummary: Record<string, number>;
  integrityCheckStatus: string;
}

export interface BackupResult {
  backupPath: string;
  metadataPath: string;
  filename: string;
  sizeBytes: number;
  sha256Checksum: string;
  createdAt: string;
  integrityOk: boolean;
  prunedCount: number;
  metadata: BackupMetadata;
}

export interface RestoreResult {
  ok: boolean;
  restoredFrom: string;
  targetPath: string;
  sha256Verified: boolean;
}

export interface BackupFileInfo {
  filename: string;
  filePath: string;
  metadataPath?: string;
  sizeBytes: number;
  createdAt: string;
  sha256Checksum?: string;
  schemaVersion?: number;
}

/**
 * Pluggable Storage Abstraction for Backup Operations.
 * Enables zero-refactor extension to S3 / Object Storage in enterprise production deployments.
 */
export interface IBackupStorage {
  save(tempFilePath: string, finalFilename: string, destDir: string, metadata?: BackupMetadata): Promise<string>;
  list(destDir: string): Promise<BackupFileInfo[]>;
  prune(destDir: string, retentionCount: number): Promise<number>;
  verify(filePath: string): Promise<{ ok: boolean; errors?: string[] }>;
}

export class LocalFilesystemStorage implements IBackupStorage {
  save(tempFilePath: string, finalFilename: string, destDir: string, metadata?: BackupMetadata): Promise<string> {
    const finalPath = path.join(destDir, finalFilename);
    fs.renameSync(tempFilePath, finalPath);
    if (metadata) {
      const metaPath = path.join(destDir, `${finalFilename}.meta.json`);
      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), "utf8");
    }
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
const APP_VERSION = "0.1.0";
const CORROBORATION_VERSION = "v2.1-tactical";

/** In-process mutex to prevent concurrent backup invocations */
let isBackupInProgress = false;

/**
 * Checks whether a given directory is located within a known cloud-synchronized folder
 * (OneDrive, Dropbox, Google Drive, iCloud, Nextcloud).
 */
export function isCloudSyncPath(directoryPath: string): { isSyncPath: boolean; provider?: string } {
  const normalized = path.resolve(directoryPath).toLowerCase();
  if (normalized.includes("onedrive")) return { isSyncPath: true, provider: "Microsoft OneDrive" };
  if (normalized.includes("dropbox")) return { isSyncPath: true, provider: "Dropbox" };
  if (normalized.includes("google drive") || normalized.includes("googledrive")) return { isSyncPath: true, provider: "Google Drive" };
  if (normalized.includes("icloud")) return { isSyncPath: true, provider: "Apple iCloud" };
  if (normalized.includes("nextcloud")) return { isSyncPath: true, provider: "Nextcloud" };
  return { isSyncPath: false };
}

/**
 * Verifies that a candidate path is strictly contained within an allowed base directory.
 * Defends against:
 *  - Parent directory traversal (../, ..\, /../, mixed slashes)
 *  - Absolute path escapes outside base directory
 *  - Prefix confusion (e.g. /backups_evil vs /backups)
 *  - Symlink escapes (resolves realpath when files exist)
 */
export function isPathContained(parentDir: string, candidatePath: string): boolean {
  const resolvedParent = path.resolve(parentDir);
  const resolvedCandidate = path.resolve(candidatePath);

  // 1. Path relative containment check
  const rel = path.relative(resolvedParent, resolvedCandidate);
  if (rel.startsWith("..") || path.isAbsolute(rel) || rel === "") {
    return false;
  }

  // 2. Exact directory prefix boundary check (guarantees no prefix confusion like /backup vs /backup_evil)
  const normalizedParent = resolvedParent.endsWith(path.sep) ? resolvedParent : resolvedParent + path.sep;
  if (!resolvedCandidate.startsWith(normalizedParent)) {
    return false;
  }

  // 3. Symlink escape check: if candidate exists on disk, check canonical realpath
  try {
    if (fs.existsSync(resolvedCandidate) && fs.existsSync(resolvedParent)) {
      const realParent = fs.realpathSync(resolvedParent);
      const realCandidate = fs.realpathSync(resolvedCandidate);
      const realRel = path.relative(realParent, realCandidate);
      if (realRel.startsWith("..") || path.isAbsolute(realRel)) {
        return false;
      }
    }
  } catch {
    return false;
  }

  return true;
}

/**
 * Resolves a backup identifier or path to an absolute path, ensuring it is strictly contained
 * within the authorized backup directory.
 */
export function resolveSafeBackupPath(backupPathOrFilename: string, customBackupDir?: string): string {
  if (!backupPathOrFilename || typeof backupPathOrFilename !== "string") {
    throw new Error("Invalid backup path: must be a non-empty string.");
  }

  const backupDir = resolveBackupDir(customBackupDir);

  // Strip any URL-encoding just in case
  let decoded = backupPathOrFilename.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // ignore decode error
  }

  // POSIX'te "\" sıradan bir karakterdir: "..\..\x.db" Linux'ta tek bir dosya adına dönüşür ve
  // denetimden geçerdi. Saldırı girdisi her platformda aynı sonucu vermeli; Windows ayırıcısı
  // POSIX'te de ayırıcı sayılır, sürücü harfli yol ise POSIX'te meşru olamaz.
  if (path.sep === "/") {
    if (/^[a-zA-Z]:[\\/]/.test(decoded)) {
      throw new Error(`PATH TRAVERSAL BLOCKED: Backup path "${backupPathOrFilename}" is outside the authorized backup directory.`);
    }
    decoded = decoded.replace(/\\/g, "/");
  }

  // If candidate is a simple filename or relative path, resolve inside backupDir
  const candidate = path.isAbsolute(decoded)
    ? path.resolve(decoded)
    : path.resolve(backupDir, decoded);

  if (!isPathContained(backupDir, candidate)) {
    throw new Error(`PATH TRAVERSAL BLOCKED: Backup path "${backupPathOrFilename}" is outside the authorized backup directory.`);
  }

  return candidate;
}

/**
 * Resolves the active backup directory with security path normalization and cloud sync risk detection.
 */
export function resolveBackupDir(customDir?: string): string {
  const target = customDir ?? process.env.BACKUP_DIR ?? DEFAULT_BACKUP_DIR;
  const resolved = path.resolve(target);

  const syncCheck = isCloudSyncPath(resolved);
  if (syncCheck.isSyncPath) {
    console.warn(
      `[BACKUP WARNING] Backup destination "${resolved}" is within a cloud-synchronized folder (${syncCheck.provider}). ` +
      `Cloud file-locking may interfere with atomic operations. For production, set BACKUP_DIR to an isolated local disk volume.`
    );
  }

  return resolved;
}

/**
 * Computes SHA-256 cryptographic hash of a file.
 */
export function computeFileSha256(filePath: string): string {
  const fileBuffer = fs.readFileSync(path.resolve(filePath));
  return crypto.createHash("sha256").update(fileBuffer).digest("hex");
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
 * Extracts table summary and schema version from an active SQLite database.
 */
export function extractDatabaseMetadata(activeDb: typeof db): {
  schemaVersion: number;
  tablesSummary: Record<string, number>;
} {
  let schemaVersion = 1;
  const tablesSummary: Record<string, number> = {};

  try {
    const verRow = activeDb.prepare("SELECT MAX(version) as maxVer FROM schema_migrations").get() as { maxVer: number | null } | undefined;
    if (verRow && typeof verRow.maxVer === "number") {
      schemaVersion = verRow.maxVer;
    }
  } catch {
    schemaVersion = 1;
  }

  const tableNames = ["articles", "events", "pins", "bookmarks", "settings"];
  for (const table of tableNames) {
    try {
      const countRow = activeDb.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as { cnt: number } | undefined;
      tablesSummary[table] = countRow?.cnt ?? 0;
    } catch {
      tablesSummary[table] = 0;
    }
  }

  return { schemaVersion, tablesSummary };
}

/**
 * Creates a transactional, WAL-safe online backup of the SQLite database.
 * Uses atomic temp-file promotion, in-process concurrency locking,
 * generates SHA-256 checksums and companion metadata artifacts, and validates PRAGMA integrity_check.
 */
export async function createBackup(options: BackupOptions = {}): Promise<BackupResult> {
  if (isBackupInProgress) {
    throw new Error("Concurrent backup operation in progress. Operation rejected to prevent race conditions.");
  }

  isBackupInProgress = true;
  let tempPath: string | undefined;

  try {
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
        // Also the -wal/-shm sidecars earlier versions left beside every snapshot.
        if (entry.startsWith("wartracker-backup-") && /\.tmp(-wal|-shm)?$/.test(entry)) {
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
    const metadataPath = path.join(destDir, `${filename}.meta.json`);
    tempPath = path.join(destDir, `${filename}.tmp`);

    // 1. Perform online consistent snapshot via better-sqlite3 backup API
    await activeDb.backup(tempPath);

    // The snapshot inherits the live database's WAL mode, so every later open
    // (even the read-only integrity check) creates -wal/-shm sidecars. Those were
    // orphaned by the rename below and never rotated. A backup is an archive,
    // not a live database: make it one self-contained file.
    const snapshotDb = new Database(tempPath, { fileMustExist: true });
    try {
      snapshotDb.pragma("journal_mode = DELETE");
    } finally {
      snapshotDb.close();
    }

    // 2. Verify integrity of the created snapshot
    const integrity = verifyBackupIntegrity(tempPath);
    if (!integrity.ok) {
      throw new Error(`Backup failed integrity verification: ${integrity.errors?.join(", ")}`);
    }

    // 3. Atomically promote the verified temp file to the final backup file
    fs.renameSync(tempPath, finalPath);

    const stats = fs.statSync(finalPath);
    const sha256Checksum = computeFileSha256(finalPath);
    const { schemaVersion, tablesSummary } = extractDatabaseMetadata(activeDb);

    const metadata: BackupMetadata = {
      filename,
      sizeBytes: stats.size,
      sha256Checksum,
      createdAt: now.toISOString(),
      databaseSchemaVersion: schemaVersion,
      applicationVersion: APP_VERSION,
      corroborationAlgorithmVersion: CORROBORATION_VERSION,
      tablesSummary,
      integrityCheckStatus: "ok"
    };

    // 4. Save companion metadata artifact
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf8");

    // 5. Rotate old backups beyond the retention limit
    const prunedCount = rotateBackups(destDir, retention);

    return {
      backupPath: finalPath,
      metadataPath,
      filename,
      sizeBytes: stats.size,
      sha256Checksum,
      createdAt: now.toISOString(),
      integrityOk: true,
      prunedCount,
      metadata
    };
  } catch (err) {
    // Clean up temporary file if leftover
    if (tempPath && fs.existsSync(tempPath)) {
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
 * Cleans up companion `.meta.json` files alongside deleted `.db` files.
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

    if (file.metadataPath && fs.existsSync(file.metadataPath)) {
      try {
        fs.unlinkSync(file.metadataPath);
      } catch {
        // ignore metadata prune error
      }
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
      const metaPath = path.join(destDir, `${name}.meta.json`);
      const stat = fs.statSync(fullPath);

      let sha256Checksum: string | undefined;
      let schemaVersion: number | undefined;

      if (fs.existsSync(metaPath)) {
        try {
          const metaContent = JSON.parse(fs.readFileSync(metaPath, "utf8")) as Partial<BackupMetadata>;
          sha256Checksum = metaContent.sha256Checksum;
          schemaVersion = metaContent.databaseSchemaVersion;
        } catch {
          // ignore corrupted metadata
        }
      }

      return {
        filename: name,
        filePath: fullPath,
        metadataPath: fs.existsSync(metaPath) ? metaPath : undefined,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
        sha256Checksum,
        schemaVersion
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
export interface RestoreOptions {
  allowedBackupDir?: string;
}

export function restoreBackup(
  backupPath: string,
  targetDbPath?: string,
  options: RestoreOptions = {}
): RestoreResult {
  const resolvedBackup = resolveSafeBackupPath(backupPath, options.allowedBackupDir);
  const targetPath = targetDbPath ?? DATABASE_PATH;
  const resolvedTarget = path.resolve(targetPath);

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

  // Optional: Verify SHA-256 against companion metadata if available
  let sha256Verified = false;
  const metaPath = `${resolvedBackup}.meta.json`;
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as Partial<BackupMetadata>;
      if (meta.sha256Checksum) {
        const actualChecksum = computeFileSha256(resolvedBackup);
        if (actualChecksum !== meta.sha256Checksum) {
          throw new Error(
            `SHA-256 checksum mismatch on backup file! Expected: ${meta.sha256Checksum}, Actual: ${actualChecksum}`
          );
        }
        sha256Verified = true;
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("checksum mismatch")) {
        throw err;
      }
      // Non-fatal if metadata format is legacy
    }
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
      targetPath: resolvedTarget,
      sha256Verified
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
