import { describe, expect, it, afterAll } from "vitest";
import { performance } from "perf_hooks";
import db from "../src/db";
import { clusterRecentEvents } from "../src/services/corroboration.service";
import { computeExplainableThreat } from "../src/services/threat.service";
import request from "supertest";
import { createApp } from "../src/app";

import fs from "fs";
import path from "path";
import os from "os";
import { createBackup } from "../src/services/backup.service";

const app = createApp(["http://localhost:5173"]);

function computePercentiles(durations: number[]) {
  const sorted = [...durations].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const avg = sorted.reduce((sum, d) => sum + d, 0) / sorted.length;
  return {
    p50: Number(p50.toFixed(2)),
    p95: Number(p95.toFixed(2)),
    p99: Number(p99.toFixed(2)),
    avg: Number(avg.toFixed(2))
  };
}

describe("PERFORMANCE, LATENCY & WORKLOAD BENCHMARKS", () => {
  const tmpBackupDir = fs.mkdtempSync(path.join(os.tmpdir(), "wartracker-perf-backup-"));

  afterAll(() => {
    // Clean up synthetic events and temp backup dir
    db.prepare("DELETE FROM events").run();
    if (fs.existsSync(tmpBackupDir)) {
      fs.rmSync(tmpBackupDir, { recursive: true, force: true });
    }
  });

  const datasetSizes = [100, 1000, 3000, 10000];

  for (const size of datasetSizes) {
    it(`benchmarks performance against ${size} synthetic events`, async () => {
      db.prepare("DELETE FROM events").run();

      const insertBatch = db.transaction((count: number) => {
        const insertStmt = db.prepare(`
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
          { lat: 31.7683, lng: 35.2137, name: "Jerusalem" }
        ];

        for (let i = 0; i < count; i++) {
          const city = cities[i % cities.length];
          const source = sources[i % sources.length];
          const severity = String((i % 5) + 1);
          // Distribute timestamps over the last 24 hours
          const hoursAgo = (i / count) * 23.5;
          const createdAt = new Date(Date.now() - hoursAgo * 3_600_000).toISOString();

          insertStmt.run({
            type: Number(severity) >= 4 ? "kritik" : "çatışma",
            title: `Tactical airstrike alert in ${city.name} zone ${i % 10}`,
            description: `Military activity reported in ${city.name} regional defense sector with multiple missile intercepts.`,
            severity,
            source,
            lat: city.lat + (Math.random() - 0.5) * 0.1,
            lng: city.lng + (Math.random() - 0.5) * 0.1,
            createdAt
          });
        }
      });

      const seedStart = performance.now();
      insertBatch(size);
      const seedDuration = performance.now() - seedStart;

      // 1. Benchmark Event Query Latency
      const queryLatencies: number[] = [];
      for (let i = 0; i < 30; i++) {
        const start = performance.now();
        db.prepare("SELECT * FROM events ORDER BY createdAt DESC LIMIT 50").all();
        queryLatencies.push(performance.now() - start);
      }
      const queryMetrics = computePercentiles(queryLatencies);

      // 2. Benchmark Corroboration Clustering Latency
      const clusterLatencies: number[] = [];
      let clusterCount = 0;
      const clusterIters = size >= 10000 ? 2 : 5;
      for (let i = 0; i < clusterIters; i++) {
        const start = performance.now();
        const clusters = clusterRecentEvents(24);
        clusterLatencies.push(performance.now() - start);
        clusterCount = clusters.length;
      }
      const clusterMetrics = computePercentiles(clusterLatencies);

      // 3. Benchmark Threat Engine Calculation Latency
      const threatLatencies: number[] = [];
      const threatIters = size >= 10000 ? 3 : 10;
      for (let i = 0; i < threatIters; i++) {
        const start = performance.now();
        computeExplainableThreat();
        threatLatencies.push(performance.now() - start);
      }
      const threatMetrics = computePercentiles(threatLatencies);

      // 4. Benchmark SitRep Generation Endpoint Latency
      const sitrepLatencies: number[] = [];
      const sitrepIters = size >= 10000 ? 2 : 5;
      for (let i = 0; i < sitrepIters; i++) {
        const start = performance.now();
        const res = await request(app).get("/api/events/sitrep?hours=24");
        expect(res.status).toBe(200);
        sitrepLatencies.push(performance.now() - start);
      }
      const sitrepMetrics = computePercentiles(sitrepLatencies);

      // 5. Benchmark Online Backup Creation Latency
      const backupStart = performance.now();
      const backupResult = await createBackup({ destinationDir: tmpBackupDir, retentionCount: 3 });
      const backupDuration = performance.now() - backupStart;

      const mem = process.memoryUsage();

      console.info(`\n[PERFORMANCE BENCHMARK RESULTS — ${size} EVENTS]`);
      console.info(`  Database Seeding: ${seedDuration.toFixed(2)} ms`);
      console.info(`  Event Query Latency: p50=${queryMetrics.p50}ms | p95=${queryMetrics.p95}ms | p99=${queryMetrics.p99}ms`);
      console.info(`  Clustering (${clusterCount} clusters): avg=${clusterMetrics.avg}ms | p95=${clusterMetrics.p95}ms`);
      console.info(`  Threat Engine: avg=${threatMetrics.avg}ms | p95=${threatMetrics.p95}ms`);
      console.info(`  SitRep HTTP Endpoint: avg=${sitrepMetrics.avg}ms | p95=${sitrepMetrics.p95}ms`);
      console.info(`  Online Backup (${(backupResult.sizeBytes / 1024).toFixed(1)} KB): ${backupDuration.toFixed(2)}ms`);
      console.info(`  Memory: RSS=${(mem.rss / 1024 / 1024).toFixed(2)}MB, HeapUsed=${(mem.heapUsed / 1024 / 1024).toFixed(2)}MB`);

      expect(queryMetrics.p95).toBeLessThan(100);
      expect(backupResult.integrityOk).toBe(true);
    }, 30000);
  }
});
