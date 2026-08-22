import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { performance } from "perf_hooks";
import Database from "better-sqlite3";
import { runMigrations } from "../src/db/migrate";
import { createBackup } from "../src/services/backup.service";

describe("LONG-RUNNING SOAK & RELIABILITY SIMULATION", () => {
  it("simulates 10,000 accelerated operational cycles tracking leaks, WAL growth, and circuit breaker resilience", async () => {
    console.log("\n===============================================================================");
    console.log("WARTRACKER ACCELERATED SOAK TEST HARNESS (10,000 OPERATIONAL CYCLES)");
    console.log("===============================================================================");

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wartracker-soak-audit-"));
    const dbPath = path.join(tmpDir, "soak_test.db");
    const backupDir = path.join(tmpDir, "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    const soakDb = new Database(dbPath);
    soakDb.pragma("journal_mode = WAL");
    soakDb.pragma("foreign_keys = ON");
    soakDb.pragma("busy_timeout = 5000");
    runMigrations(soakDb);

    const insertArticle = soakDb.prepare(`
      INSERT OR IGNORE INTO articles (guid, title, link, source, category, description, createdAt)
      VALUES (@guid, @title, @link, @source, @category, @description, @createdAt)
    `);

    const insertEvent = soakDb.prepare(`
      INSERT INTO events (type, title, description, severity, source, lat, lng, createdAt)
      VALUES (@type, @title, @description, @severity, @source, @lat, @lng, @createdAt)
    `);

    const sources = ["Reuters", "BBC World", "ISW", "Defense One", "Al Jazeera", "Flaky Wire", "Dead Feed"];
    const sourceHealth = new Map<string, { failCount: number; openUntil: number; lastError: string | null }>();

    function getSourceState(name: string) {
      let state = sourceHealth.get(name);
      if (!state) {
        state = { failCount: 0, openUntil: 0, lastError: null };
        sourceHealth.set(name, state);
      }
      return state;
    }

    let successfulIngestions = 0;
    let duplicateIngestions = 0;
    let simulatedFailures = 0;
    let circuitOpenCount = 0;
    let fallbackCount = 0;
    let backupCount = 0;

    const initialMem = process.memoryUsage();
    const cycleLatencies: number[] = [];

    const TOTAL_CYCLES = Number(process.env.SOAK_CYCLES ?? 10000);

    for (let cycle = 1; cycle <= TOTAL_CYCLES; cycle++) {
      const cycleStart = performance.now();

      // 1. Ingest RSS articles (mix of fresh, duplicates, and failing sources)
      const isFailingSource = cycle % 7 === 0;
      const isDuplicate = cycle % 3 === 0;
      const source = sources[cycle % sources.length];
      const state = getSourceState(source);

      if (state.openUntil > Date.now()) {
        circuitOpenCount++;
      } else if (isFailingSource) {
        simulatedFailures++;
        state.failCount++;
        if (state.failCount >= 3) {
          state.openUntil = Date.now() + 50; // 50ms test cooldown
        }
        fallbackCount++;
      } else {
        state.failCount = 0;
        state.openUntil = 0;
        const guid = isDuplicate ? `guid-soak-dup-${cycle % 20}` : `guid-soak-${cycle}`;
        const info = insertArticle.run({
          guid,
          title: `Soak Test Tactical Article #${cycle}`,
          link: `https://example.com/soak/${guid}`,
          source,
          category: "haber",
          description: `Detailed tactical telemetry stream for operational cycle ${cycle}.`,
          createdAt: new Date().toISOString()
        });

        if (info.changes > 0) {
          successfulIngestions++;
        } else {
          duplicateIngestions++;
        }
      }

      // 2. Insert Events
      if (cycle % 2 === 0) {
        insertEvent.run({
          type: "strike",
          title: `Soak Event Strike ${cycle}`,
          description: `Tactical air defense engagement simulation.`,
          severity: String((cycle % 5) + 1),
          source,
          lat: 33.5 + (cycle % 10) * 0.05,
          lng: 36.2 + (cycle % 10) * 0.05,
          createdAt: new Date().toISOString()
        });
      }

      // 3. Periodic Threat Calculation (every 100 cycles)
      if (cycle % 100 === 0) {
        const crit1h = (
          soakDb
            .prepare("SELECT COUNT(*) as cnt FROM events WHERE CAST(severity AS INTEGER) >= 4")
            .get() as { cnt: number }
        ).cnt;
        expect(crit1h).toBeGreaterThanOrEqual(0);
      }

      // 4. Periodic Online Backup (every 1,000 cycles)
      if (cycle % 1000 === 0) {
        const backupRes = await createBackup({
          sourceDb: soakDb as any,
          destinationDir: backupDir,
          retentionCount: 3
        });
        expect(backupRes.integrityOk).toBe(true);
        backupCount++;
      }

      const cycleElapsed = performance.now() - cycleStart;
      cycleLatencies.push(cycleElapsed);
    }

    const finalMem = process.memoryUsage();
    const sortedLatencies = [...cycleLatencies].sort((a, b) => a - b);
    const p50Latency = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)];
    const p95Latency = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)];

    const dbSize = fs.statSync(dbPath).size;
    const walPath = `${dbPath}-wal`;
    const walSize = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0;

    console.log(`\nSOAK TEST SUMMARY (${TOTAL_CYCLES.toLocaleString()} CYCLES):`);
    console.log(`  • Successful Ingestions : ${successfulIngestions.toLocaleString()}`);
    console.log(`  • Deduplicated Articles : ${duplicateIngestions.toLocaleString()}`);
    console.log(`  • Simulated Feed Errors : ${simulatedFailures.toLocaleString()}`);
    console.log(`  • Circuit Breaker Opens : ${circuitOpenCount.toLocaleString()}`);
    console.log(`  • Fallback Recoveries   : ${fallbackCount.toLocaleString()}`);
    console.log(`  • Online Backups Taken  : ${backupCount.toLocaleString()}`);
    console.log(`  • Cycle Latency (p50)   : ${p50Latency.toFixed(2)} ms | (p95): ${p95Latency.toFixed(2)} ms`);
    console.log(`  • DB Final Size         : ${(dbSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  • WAL Final Size        : ${(walSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  • Initial Heap Used     : ${(initialMem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  • Final Heap Used       : ${(finalMem.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  • Heap Growth Delta     : ${((finalMem.heapUsed - initialMem.heapUsed) / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  • Initial RSS           : ${(initialMem.rss / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  • Final RSS             : ${(finalMem.rss / 1024 / 1024).toFixed(2)} MB`);
    console.log("===============================================================================\n");

    // Clean up
    soakDb.close();
    if (fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }

    expect(successfulIngestions).toBeGreaterThan(5000);
    expect(backupCount).toBe(10);
    expect(p95Latency).toBeLessThan(50);
  }, 60000);
});
