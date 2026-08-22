import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { performance } from "perf_hooks";
import Database from "better-sqlite3";
import { runMigrations } from "../src/db/migrate";
import { createBackup } from "../src/services/backup.service";

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

function getFileSize(filePath: string): number {
  try {
    return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
  } catch {
    return 0;
  }
}

describe("SCALE, LATENCY & MEMORY ADVERSARIAL BENCHMARK (100 to 100,000 Events)", () => {
  it("benchmarks performance, WAL size, query percentiles, and backup across 7 scale tiers", async () => {
    console.log("\n===============================================================================");
    console.log("WARTRACKER SCALE, LATENCY, MEMORY & WORKLOAD EMPIRICAL BENCHMARK");
    console.log("===============================================================================");

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wartracker-scale-audit-"));
    const dbPath = path.join(tmpDir, "scale_test.db");
    const backupDir = path.join(tmpDir, "backups");
    fs.mkdirSync(backupDir, { recursive: true });

    const testDb = new Database(dbPath);
    testDb.pragma("journal_mode = WAL");
    testDb.pragma("foreign_keys = ON");
    testDb.pragma("busy_timeout = 5000");
    runMigrations(testDb);

    const insertStmt = testDb.prepare(`
      INSERT INTO events (type, title, description, severity, source, lat, lng, createdAt)
      VALUES (@type, @title, @description, @severity, @source, @lat, @lng, @createdAt)
    `);

    const sources = ["BBC World", "Reuters", "ISW", "Defense One", "Al Jazeera", "Jerusalem Post", "Iran Int'l"];
    const cities = [
      { lat: 33.5138, lng: 36.2765, name: "Damascus" },
      { lat: 32.0853, lng: 34.7818, name: "Tel Aviv" },
      { lat: 32.6546, lng: 51.6680, name: "Isfahan" },
      { lat: 35.6892, lng: 51.3890, name: "Tehran" },
      { lat: 33.8886, lng: 35.4955, name: "Beirut" },
      { lat: 31.7683, lng: 35.2137, name: "Jerusalem" },
      { lat: 36.2021, lng: 37.1343, name: "Aleppo" },
      { lat: 14.7978, lng: 42.9545, name: "Hodeidah" },
      { lat: 29.5577, lng: 34.9519, name: "Eilat" },
      { lat: 33.3152, lng: 44.3661, name: "Baghdad" }
    ];

    const scalePoints = [100, 1000, 3000, 10000, 25000, 50000, 100000];
    let currentCount = 0;

    for (const targetCount of scalePoints) {
      const toInsert = targetCount - currentCount;
      const seedStart = performance.now();

      const insertBatch = testDb.transaction((count: number, startIdx: number) => {
        for (let i = 0; i < count; i++) {
          const globalIdx = startIdx + i;
          const city = cities[globalIdx % cities.length];
          const source = sources[globalIdx % sources.length];
          const severity = String((globalIdx % 5) + 1);
          const hoursAgo = (globalIdx / targetCount) * 23.5;
          const createdAt = new Date(Date.now() - hoursAgo * 3_600_000).toISOString();

          insertStmt.run({
            type: Number(severity) >= 4 ? "kritik" : "çatışma",
            title: `Tactical missile activity alert in ${city.name} zone ${globalIdx % 10}`,
            description: `Military command reported interceptor launches and radar contacts near ${city.name}.`,
            severity,
            source,
            lat: city.lat + (Math.random() - 0.5) * 0.1,
            lng: city.lng + (Math.random() - 0.5) * 0.1,
            createdAt
          });
        }
      });

      insertBatch(toInsert, currentCount);
      currentCount = targetCount;
      const seedElapsed = performance.now() - seedStart;

      const queryLatencies: number[] = [];
      for (let q = 0; q < 20; q++) {
        const qStart = performance.now();
        testDb.prepare("SELECT * FROM events ORDER BY createdAt DESC LIMIT 50").all();
        queryLatencies.push(performance.now() - qStart);
      }
      const queryMetrics = computePercentiles(queryLatencies);

      const backupStart = performance.now();
      const backupResult = await createBackup({
        sourceDb: testDb as any,
        destinationDir: backupDir,
        retentionCount: 3
      });
      const backupDuration = performance.now() - backupStart;

      const dbSizeBytes = getFileSize(dbPath);
      const walSizeBytes = getFileSize(`${dbPath}-wal`);
      const mem = process.memoryUsage();

      console.log(`\n-------------------------------------------------------------------------------`);
      console.log(`SCALE POINT: ${targetCount.toLocaleString()} EVENTS`);
      console.log(`-------------------------------------------------------------------------------`);
      console.log(`  • DB Seeding Duration    : ${seedElapsed.toFixed(1)} ms (${(toInsert / (seedElapsed / 1000)).toFixed(0)} events/sec)`);
      console.log(`  • DB Query Latency (p50) : ${queryMetrics.p50} ms | (p95): ${queryMetrics.p95} ms | (p99): ${queryMetrics.p99} ms`);
      console.log(`  • Online Backup Duration : ${backupDuration.toFixed(1)} ms (Backup Size: ${(backupResult.sizeBytes / 1024 / 1024).toFixed(2)} MB)`);
      console.log(`  • Database File Size     : ${(dbSizeBytes / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  • WAL Sidecar File Size  : ${(walSizeBytes / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  • Process Memory (RSS)   : ${(mem.rss / 1024 / 1024).toFixed(1)} MB`);
      console.log(`  • Process Heap Used      : ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB / ${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB`);

      expect(queryMetrics.p95).toBeLessThan(100);
      expect(backupResult.integrityOk).toBe(true);
    }

    // Memory Jump Profile
    console.log("\n===============================================================================");
    console.log("MEMORY JUMP (3,000 EVENTS) & GC STABILITY INVESTIGATION");
    console.log("===============================================================================");

    for (let cycle = 1; cycle <= 5; cycle++) {
      testDb.prepare("DELETE FROM events").run();
      testDb.pragma("wal_checkpoint(TRUNCATE)");

      const memBefore = process.memoryUsage();

      testDb.transaction(() => {
        for (let i = 0; i < 3000; i++) {
          insertStmt.run({
            type: "kritik",
            title: `Memory Profile Strike ${i}`,
            description: `Profiling V8 heap behavior across repeated 3000 event allocations.`,
            severity: "4",
            source: "Reuters",
            lat: 33.5,
            lng: 36.2,
            createdAt: new Date().toISOString()
          });
        }
      })();

      testDb.prepare("SELECT * FROM events ORDER BY createdAt DESC LIMIT 100").all();

      const memAfter = process.memoryUsage();
      console.log(`  Cycle ${cycle}: RSS = ${(memAfter.rss / 1024 / 1024).toFixed(1)} MB, HeapUsed = ${(memAfter.heapUsed / 1024 / 1024).toFixed(1)} MB (Delta: +${((memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024).toFixed(2)} MB)`);
    }

    testDb.close();
    if (fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }, 120000);
});
