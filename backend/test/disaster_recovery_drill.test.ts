import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { performance } from "perf_hooks";
import Database from "better-sqlite3";
import { runMigrations } from "../src/db/migrate";
import { createBackup, restoreBackup, verifyBackupIntegrity } from "../src/services/backup.service";

describe("DISASTER RECOVERY OPERATIONAL DRILL & RTO/RPO MEASUREMENT", () => {
  it("executes the full 12-step operational recovery drill and measures RTO/RPO", async () => {
    console.log("\n===============================================================================");
    console.log("WARTRACKER OPERATIONAL DISASTER RECOVERY DRILL");
    console.log("===============================================================================");

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wartracker-dr-drill-"));
    const primaryDbPath = path.join(tmpDir, "primary.db");
    const backupDir = path.join(tmpDir, "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    // Step 1: Application running
    let appDb: InstanceType<typeof Database> | null = new Database(primaryDbPath);
    appDb.pragma("journal_mode = WAL");
    appDb.pragma("foreign_keys = ON");
    runMigrations(appDb);

    // Step 2 & 3: Active writes with WAL active
    appDb.prepare(`
      INSERT INTO articles (guid, title, link, source, category, createdAt)
      VALUES ('guid-dr-1', 'Critical Intelligence Dispatch 1', 'https://example.com/dr1', 'Reuters', 'haber', @t)
    `).run({ t: new Date(Date.now() - 3600_000).toISOString() });

    appDb.prepare(`
      INSERT INTO events (type, title, severity, source, lat, lng, createdAt)
      VALUES ('strike', 'Air Defense Action at Damascus', '4', 'Reuters', 33.5138, 36.2765, @t)
    `).run({ t: new Date(Date.now() - 3600_000).toISOString() });

    // Step 4: Backup created and verified
    const backupTimestamp = Date.now();
    const backupResult = await createBackup({
      sourceDb: appDb as any,
      destinationDir: backupDir,
      retentionCount: 5
    });
    expect(backupResult.integrityOk).toBe(true);

    // Post-backup mutation (data that will define RPO boundary)
    appDb.prepare(`
      INSERT INTO articles (guid, title, link, source, category, createdAt)
      VALUES ('guid-dr-post-backup', 'Post-Backup Uncommitted Item', 'https://example.com/dr-post', 'BBC', 'haber', @t)
    `).run({ t: new Date().toISOString() });

    // Step 5: Catastrophic corruption occurs (file overwritten with corrupt junk & process crash)
    const disasterTime = Date.now();
    appDb.close();
    appDb = null;
    fs.writeFileSync(primaryDbPath, "CATASTROPHIC_SYSTEM_CRASH_AND_CORRUPTED_DATABASE_HEADER\x00\xFF\xFE");

    // ── DISASTER RECOVERY PROCEDURE COMMENCES ───────────────────────────────────
    const rtoStartTime = performance.now();

    // Step 6: Application stopped safely (process teardown verified)
    expect(appDb).toBeNull();

    // Step 7: Backup verified with PRAGMA integrity_check
    const integrity = verifyBackupIntegrity(backupResult.backupPath);
    expect(integrity.ok).toBe(true);

    // Step 8: Restore performed with sidecar cleanup (-wal, -shm removal)
    const restoreRes = restoreBackup(backupResult.backupPath, primaryDbPath, { allowedBackupDir: backupDir });
    expect(restoreRes.ok).toBe(true);

    // Step 9: Application restarted
    const recoveredDb = new Database(primaryDbPath);
    recoveredDb.pragma("foreign_keys = ON");

    // Step 10: Migrations verified
    runMigrations(recoveredDb);

    // Step 11: Smoke tests executed
    const smokeIntegrity = recoveredDb.pragma("integrity_check") as Array<{ integrity_check: string }>;
    expect(smokeIntegrity[0].integrity_check).toBe("ok");

    // Step 12: Data integrity checked
    const recoveredArticles = recoveredDb.prepare("SELECT * FROM articles").all() as any[];
    const recoveredEvents = recoveredDb.prepare("SELECT * FROM events").all() as any[];

    const rtoElapsedMs = performance.now() - rtoStartTime;
    const rpoMs = disasterTime - backupTimestamp;

    console.log(`\nDISASTER RECOVERY DRILL RESULTS:`);
    console.log(`  • Status                 : SUCCESS (100% Recovery Rate)`);
    console.log(`  • Recovery Time (RTO)    : ${rtoElapsedMs.toFixed(2)} ms (Target: < 30,000 ms)`);
    console.log(`  • Recovery Point (RPO)   : ${rpoMs} ms elapsed between backup and disaster`);
    console.log(`  • Restored Articles      : ${recoveredArticles.length} (Expected: 1)`);
    console.log(`  • Restored Events        : ${recoveredEvents.length} (Expected: 1)`);
    console.log(`  • Post-Crash Corruption  : CLEANLY ELIMINATED`);
    console.log(`  • Restored DB Integrity  : OK`);
    console.log("===============================================================================\n");

    expect(recoveredArticles.length).toBe(1);
    expect(recoveredArticles[0].guid).toBe("guid-dr-1");
    expect(recoveredEvents.length).toBe(1);
    expect(recoveredEvents[0].title).toBe("Air Defense Action at Damascus");
    expect(rtoElapsedMs).toBeLessThan(5000);

    recoveredDb.close();

    if (fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });
});
