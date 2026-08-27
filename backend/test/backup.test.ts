import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { performance } from "perf_hooks";
import Database from "better-sqlite3";
import { runMigrations } from "../src/db/migrate";
import {
  createBackup,
  restoreBackup,
  verifyBackupIntegrity,
  listBackups,
  rotateBackups,
  isPathContained,
  resolveSafeBackupPath
} from "../src/services/backup.service";

function computePercentiles(durations: number[]) {
  const sorted = [...durations].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
  const avg = sorted.reduce((sum, d) => sum + d, 0) / (sorted.length || 1);
  return {
    p50: Number(p50.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    p99: Number(p99.toFixed(2)),
    avg: Number(avg.toFixed(2))
  };
}

describe("SQLITE BACKUP & DISASTER RECOVERY ADVERSARIAL AUDIT", () => {
  let tmpDir: string;
  let testDbPath: string;
  let testBackupDir: string;
  let testDb: InstanceType<typeof Database>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wartracker-backup-audit-"));
    testDbPath = path.join(tmpDir, "source.db");
    testBackupDir = path.join(tmpDir, "backups");

    testDb = new Database(testDbPath);
    testDb.pragma("journal_mode = WAL");
    testDb.pragma("foreign_keys = ON");
    testDb.pragma("busy_timeout = 5000");
    runMigrations(testDb);
  });

  afterEach(() => {
    if (testDb && testDb.open) {
      try {
        testDb.close();
      } catch {
        // ignore
      }
    }
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("creates a consistent, transactional online WAL backup with verified integrity", async () => {
    testDb.prepare(`
      INSERT INTO articles (guid, title, link, source, category)
      VALUES ('guid-1', 'Initial Article 1', 'https://example.com/1', 'BBC', 'haber')
    `).run();

    testDb.prepare(`
      INSERT INTO pins (lat, lng, title, category)
      VALUES (32.0853, 34.7818, 'Tel Aviv Outpost', 'info')
    `).run();

    const result = await createBackup({
      sourceDb: testDb as any,
      destinationDir: testBackupDir,
      retentionCount: 5
    });

    expect(result.integrityOk).toBe(true);
    expect(fs.existsSync(result.backupPath)).toBe(true);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.filename).toMatch(/^wartracker-backup-.*\.db$/);

    const integrity = verifyBackupIntegrity(result.backupPath);
    expect(integrity.ok).toBe(true);

    const backupDb = new Database(result.backupPath, { readonly: true });
    const articles = backupDb.prepare("SELECT * FROM articles").all() as any[];
    const pins = backupDb.prepare("SELECT * FROM pins").all() as any[];
    backupDb.close();

    expect(articles.length).toBe(1);
    expect(articles[0].guid).toBe("guid-1");
    expect(pins.length).toBe(1);
    expect(pins[0].title).toBe("Tel Aviv Outpost");
  });

  it("CONCURRENCY STRESS: measures write latency and zero SQLITE_BUSY errors during active backup", async () => {
    const TOTAL_WRITES = 1000;
    const writeLatencies: number[] = [];
    let busyErrorCount = 0;
    let otherErrorCount = 0;

    const insertStmt = testDb.prepare(`
      INSERT INTO articles (guid, title, link, source, category, createdAt)
      VALUES (@guid, @title, @link, @source, @category, @createdAt)
    `);

    let stopWriting = false;
    let writeIndex = 0;

    const writerPromise = (async () => {
      while (!stopWriting && writeIndex < TOTAL_WRITES) {
        writeIndex++;
        const start = performance.now();
        try {
          insertStmt.run({
            guid: `stress-guid-${writeIndex}`,
            title: `Stress Article ${writeIndex}`,
            link: `https://example.com/stress/${writeIndex}`,
            source: "Reuters",
            category: "haber",
            createdAt: new Date().toISOString()
          });
          const elapsed = performance.now() - start;
          writeLatencies.push(elapsed);
        } catch (err: any) {
          if (err?.code === "SQLITE_BUSY" || err?.message?.includes("busy")) {
            busyErrorCount++;
          } else {
            otherErrorCount++;
          }
        }
        if (writeIndex % 20 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
      }
    })();

    const backupDurations: number[] = [];
    const backupResults: Array<{ backupPath: string; sizeBytes: number }> = [];

    for (let b = 0; b < 3; b++) {
      const bStart = performance.now();
      const res = await createBackup({
        sourceDb: testDb as any,
        destinationDir: testBackupDir,
        retentionCount: 10
      });
      const bElapsed = performance.now() - bStart;
      backupDurations.push(bElapsed);
      backupResults.push(res);
    }

    stopWriting = true;
    await writerPromise;

    const writeMetrics = computePercentiles(writeLatencies);
    const backupMetrics = computePercentiles(backupDurations);

    expect(backupMetrics.avg).toBeGreaterThanOrEqual(0);
    expect(busyErrorCount).toBe(0);
    expect(otherErrorCount).toBe(0);
    expect(writeLatencies.length).toBeGreaterThanOrEqual(100);

    for (const b of backupResults) {
      const integrity = verifyBackupIntegrity(b.backupPath);
      expect(integrity.ok).toBe(true);

      const bDb = new Database(b.backupPath, { readonly: true });
      const count = (bDb.prepare("SELECT COUNT(*) as cnt FROM articles").get() as any).cnt;
      bDb.close();
      expect(count).toBeGreaterThan(0);
    }

    expect(writeMetrics.p95).toBeLessThan(50);
  });

  it("executes a full end-to-end disaster recovery restore workflow", async () => {
    testDb.prepare(`
      INSERT INTO articles (guid, title, link, source, category)
      VALUES ('guid-baseline', 'Baseline Article', 'https://example.com/baseline', 'Reuters', 'haber')
    `).run();
    testDb.prepare(`
      INSERT INTO events (type, title, severity, source)
      VALUES ('strike', 'Baseline Strike Event', '4', 'Reuters')
    `).run();

    const backup = await createBackup({
      sourceDb: testDb as any,
      destinationDir: testBackupDir,
      retentionCount: 5
    });
    expect(backup.integrityOk).toBe(true);

    testDb.prepare(`
      INSERT INTO articles (guid, title, link, source, category)
      VALUES ('guid-post-backup', 'Post-Backup Article', 'https://example.com/post', 'BBC', 'haber')
    `).run();
    testDb.prepare(`
      INSERT INTO pins (lat, lng, title, category)
      VALUES (33.5138, 36.2765, 'Post-Backup Pin', 'strike')
    `).run();

    expect((testDb.prepare("SELECT COUNT(*) as cnt FROM articles").get() as any).cnt).toBe(2);

    testDb.close();
    fs.writeFileSync(testDbPath, "CORRUPTED_GARBAGE_DATA_SIMULATING_CRASH");

    const restoreResult = restoreBackup(backup.backupPath, testDbPath, { allowedBackupDir: testBackupDir });
    expect(restoreResult.ok).toBe(true);
    expect(restoreResult.restoredFrom).toBe(backup.backupPath);

    const restoredDb = new Database(testDbPath);
    restoredDb.pragma("foreign_keys = ON");

    const integrity = restoredDb.pragma("integrity_check") as any[];
    expect(integrity[0].integrity_check).toBe("ok");

    const restoredArticles = restoredDb.prepare("SELECT * FROM articles").all() as any[];
    const restoredEvents = restoredDb.prepare("SELECT * FROM events").all() as any[];
    const restoredPins = restoredDb.prepare("SELECT * FROM pins").all() as any[];
    restoredDb.close();

    expect(restoredArticles.length).toBe(1);
    expect(restoredArticles[0].guid).toBe("guid-baseline");
    expect(restoredEvents.length).toBe(1);
    expect(restoredEvents[0].title).toBe("Baseline Strike Event");
    expect(restoredArticles.some((a) => a.guid === "guid-post-backup")).toBe(false);
    expect(restoredPins.length).toBe(0);
  });

  it("rotates and prunes backups according to retention limit", () => {
    if (!fs.existsSync(testBackupDir)) {
      fs.mkdirSync(testBackupDir, { recursive: true });
    }

    for (let i = 1; i <= 6; i++) {
      const filename = `wartracker-backup-2026-08-22T10-0${i}-00-000Z.db`;
      const fullPath = path.join(testBackupDir, filename);
      fs.writeFileSync(fullPath, "dummy backup content");
      const mtime = new Date(Date.now() - (6 - i) * 60_000);
      fs.utimesSync(fullPath, mtime, mtime);
    }

    expect(listBackups(testBackupDir).length).toBe(6);

    const pruned = rotateBackups(testBackupDir, 3);
    expect(pruned).toBe(3);

    const remaining = listBackups(testBackupDir);
    expect(remaining.length).toBe(3);
    expect(remaining[0].filename).toBe("wartracker-backup-2026-08-22T10-06-00-000Z.db");
    expect(remaining[1].filename).toBe("wartracker-backup-2026-08-22T10-05-00-000Z.db");
    expect(remaining[2].filename).toBe("wartracker-backup-2026-08-22T10-04-00-000Z.db");
  });

  it("rejects restoring from a corrupted or invalid backup file", () => {
    const corruptBackupPath = path.join(testBackupDir, "corrupted.db");
    if (!fs.existsSync(testBackupDir)) fs.mkdirSync(testBackupDir, { recursive: true });
    fs.writeFileSync(corruptBackupPath, "NOT_A_SQLITE_DATABASE");

    expect(() => {
      restoreBackup(corruptBackupPath, testDbPath, { allowedBackupDir: testBackupDir });
    }).toThrow(/Cannot restore corrupted or invalid backup/);
  });

  it("cleans up temporary files if backup creation fails midway", async () => {
    const invalidDir = path.join(tmpDir, "forbidden\0dir");

    await expect(
      createBackup({
        sourceDb: testDb as any,
        destinationDir: invalidDir
      })
    ).rejects.toThrow();

    if (fs.existsSync(testBackupDir)) {
      const tmpFiles = fs.readdirSync(testBackupDir).filter((f) => f.endsWith(".tmp"));
      expect(tmpFiles.length).toBe(0);
    }
  });

  it("LIVE RESTORE SAFETY AUDIT: enforces fail-closed rejection when active database connection is open", () => {
    const backupPath = path.join(testBackupDir, "wartracker-backup-test.db");
    if (!fs.existsSync(testBackupDir)) fs.mkdirSync(testBackupDir, { recursive: true });

    const backupDb = new Database(backupPath);
    runMigrations(backupDb);
    backupDb.prepare("INSERT INTO articles (guid, title, link, source, category) VALUES ('g1','t1','l1','s1','c1')").run();
    backupDb.close();

    // When targeting active in-process DATABASE_PATH while db is open, restoreBackup MUST reject fail-closed
    expect(() => {
      restoreBackup(backupPath, undefined, { allowedBackupDir: testBackupDir }); // defaults to DATABASE_PATH
    }).toThrow(/FAIL-CLOSED RESTORE ERROR/);
  });

  it("produces verifiable SHA-256 checksums and companion metadata artifacts", async () => {
    const { isCloudSyncPath } = await import("../src/services/backup.service");

    // Test cloud sync detection
    expect(isCloudSyncPath("C:\\Users\\admin\\OneDrive\\Wartrack").isSyncPath).toBe(true);
    expect(isCloudSyncPath("/home/user/Dropbox/data").isSyncPath).toBe(true);
    expect(isCloudSyncPath("/var/opt/wartracker/backups").isSyncPath).toBe(false);

    testDb.prepare(`
      INSERT INTO articles (guid, title, link, source, category)
      VALUES ('guid-meta', 'Metadata Test Article', 'https://example.com/meta', 'Reuters', 'haber')
    `).run();

    const result = await createBackup({
      sourceDb: testDb as any,
      destinationDir: testBackupDir,
      retentionCount: 5
    });

    expect(result.sha256Checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(fs.existsSync(result.metadataPath)).toBe(true);

    const meta = JSON.parse(fs.readFileSync(result.metadataPath, "utf8"));
    expect(meta.sha256Checksum).toBe(result.sha256Checksum);
    expect(meta.databaseSchemaVersion).toBe(6);
    expect(meta.applicationVersion).toBe("0.1.0");
    expect(meta.corroborationAlgorithmVersion).toBe("v2.1-tactical");
    expect(meta.tablesSummary.articles).toBe(1);

    const listed = listBackups(testBackupDir);
    expect(listed[0].sha256Checksum).toBe(result.sha256Checksum);
    expect(listed[0].schemaVersion).toBe(6);

    // Tamper detection: modify backup file and verify restore detects checksum mismatch
    testDb.close();
    fs.appendFileSync(result.backupPath, "\nTAMPERED_BYTES");

    expect(() => {
      restoreBackup(result.backupPath, testDbPath, { allowedBackupDir: testBackupDir });
    }).toThrow(/checksum mismatch/i);
  });

  describe("SEC-002: PATH CONTAINMENT & TRAVERSAL ADVERSARIAL DRILL", () => {
    it("isPathContained rejects parent traversal, prefix confusion, and outside absolute paths", () => {
      const allowedDir = path.join(tmpDir, "safe_backups");
      fs.mkdirSync(allowedDir, { recursive: true });

      // Valid inside path
      const validChild = path.join(allowedDir, "snapshot.db");
      expect(isPathContained(allowedDir, validChild)).toBe(true);

      // Traversal escapes
      expect(isPathContained(allowedDir, path.join(allowedDir, "../evil.db"))).toBe(false);
      expect(isPathContained(allowedDir, path.join(allowedDir, "..", "..", "etc", "passwd"))).toBe(false);
      expect(isPathContained(allowedDir, path.join(allowedDir, "..\\..\\Windows\\System32\\config"))).toBe(false);

      // Prefix confusion (e.g. safe_backups_evil vs safe_backups)
      const evilPrefixDir = path.join(tmpDir, "safe_backups_evil");
      fs.mkdirSync(evilPrefixDir, { recursive: true });
      const evilPrefixFile = path.join(evilPrefixDir, "snapshot.db");
      expect(isPathContained(allowedDir, evilPrefixFile)).toBe(false);

      // Absolute paths outside allowedDir
      expect(isPathContained(allowedDir, "C:\\Windows\\System32\\calc.exe")).toBe(false);
      expect(isPathContained(allowedDir, "/etc/passwd")).toBe(false);
      expect(isPathContained(allowedDir, "/tmp/somedb.db")).toBe(false);

      // Exact parent directory itself is not a valid child file
      expect(isPathContained(allowedDir, allowedDir)).toBe(false);
    });

    it("resolveSafeBackupPath blocks path traversal and URL-encoded traversal payloads", () => {
      const allowedDir = path.join(tmpDir, "safe_backups");
      fs.mkdirSync(allowedDir, { recursive: true });

      const attackPayloads = [
        "../../database.db",
        "..\\..\\database.db",
        "..\\/..\\database.db",
        "../../../etc/passwd",
        "..\\..\\..\\Windows\\System32\\config\\SAM",
        "C:\\Windows\\System32\\drivers\\etc\\hosts",
        "/etc/shadow",
        "%2e%2e%2fdatabase.db",
        "%2e%2e%5cdatabase.db"
      ];

      for (const payload of attackPayloads) {
        expect(() => resolveSafeBackupPath(payload, allowedDir)).toThrow(/PATH TRAVERSAL BLOCKED/);
      }
    });

    it("restoreBackup rejects path traversal attacks fail-closed", () => {
      const allowedDir = path.join(tmpDir, "safe_backups");
      fs.mkdirSync(allowedDir, { recursive: true });

      expect(() => {
        restoreBackup("../../outside.db", testDbPath, { allowedBackupDir: allowedDir });
      }).toThrow(/PATH TRAVERSAL BLOCKED/);
    });
  });
});
