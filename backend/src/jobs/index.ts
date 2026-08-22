import cron from "node-cron";
import type { Server as SocketIOServer } from "socket.io";
import { fetchAllFeeds } from "../services/rss.service";
import { runSummarizeJob } from "./summarize.job";
import { clearInvalidSummaries } from "../services/summarize.service";
import { autoExtractEvents } from "../routes/events";
import { getNumberSetting } from "../services/settings.service";
import { jobMetrics, recordJobFailure } from "../lib/jobMetrics";

let lastAiMinuteKey = "";
let lastRssMinuteKey = "";
let rssJobRunning = false;
let aiJobRunning = false;

/**
 * clearInvalidSummaries re-validates up to N rows synchronously, blocking the
 * event loop (and therefore every socket) for the duration. It used to run on
 * every AI tick; hourly is sufficient for a repair pass.
 */
const SUMMARY_REVALIDATE_INTERVAL_MS = 60 * 60_000;
let lastSummaryRevalidateAt = 0;

function minuteKey(date: Date): string {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}-${date.getUTCHours()}-${date.getUTCMinutes()}`;
}

function shouldRunEvery(minutes: number, date: Date, lastKey: string): { run: boolean; nextKey: string } {
  const key = minuteKey(date);
  if (key === lastKey) return { run: false, nextKey: lastKey };
  const minute = date.getUTCMinutes();
  if (minute % minutes !== 0) return { run: false, nextKey: lastKey };
  return { run: true, nextKey: key };
}

/**
 * Mirrors runRssCycle's guard. A summarize run enqueues 20 articles behind a
 * 10-per-minute limiter, so it takes >= 2 minutes; without this the 1-minute
 * cron stacks overlapping runs that select the same unsummarized rows.
 */
async function runAiCycle(io: SocketIOServer): Promise<void> {
  if (aiJobRunning) return;
  aiJobRunning = true;

  try {
    const now = Date.now();
    if (now - lastSummaryRevalidateAt >= SUMMARY_REVALIDATE_INTERVAL_MS) {
      lastSummaryRevalidateAt = now;
      clearInvalidSummaries(300);
    }

    await runSummarizeJob(io);
  } catch (err) {
    console.error("[AI] Cron error:", err);
  } finally {
    aiJobRunning = false;
  }
}

async function runRssCycle(io: SocketIOServer): Promise<void> {
  if (rssJobRunning) return;
  rssJobRunning = true;

  try {
    const result = await fetchAllFeeds();
    result.insertedArticles.forEach((article) => io.emit("article:new", article));

    io.emit("feed:refreshed", {
      count: result.newArticles,
      sources: result.sourcesScanned
    });
    io.emit("stats:update");

    autoExtractEvents(io);
  } catch (err) {
    console.error("[RSS] Realtime cycle error:", err);
  } finally {
    rssJobRunning = false;
  }
}

/**
 * Wrap a cron callback so a failure is logged and counted.
 *
 * node-cron v3 detects a returned Promise and attaches its own .catch(), which
 * emits a 'task-failed' event on an internal Task object that callers have no
 * handle on. Nothing subscribes to it, so a throwing tick is swallowed in
 * complete silence — verified by observing a task throw on three consecutive
 * ticks with no output and no process effect.
 *
 * The process surviving is correct. Losing the error is not: everything
 * outside runRssCycle/runAiCycle's own try/catch — notably the
 * getNumberSetting() database read that decides whether to run at all — could
 * fail on every tick and stop ingestion permanently with no diagnostic.
 */
export function scheduledTask(name: string, task: () => Promise<void>): () => Promise<void> {
  return async () => {
    jobMetrics.job_run_total += 1;
    try {
      await task();
    } catch (err) {
      recordJobFailure(name);
      console.error(`[JOBS] ${name} tick failed:`, err);
    }
  };
}

export function registerJobs(io: SocketIOServer): void {
  /* ── Heartbeat (30 dk) ── */
  cron.schedule("*/30 * * * *", () => {
    io.emit("jobs:heartbeat", {
      timestamp: new Date().toISOString()
    });
  });

  // Escape hatch for automated environments. Booting normally fans out to
  // every configured feed, which in CI means fifteen outbound requests to real
  // news sites — slow, flaky, and not something a smoke test should be doing
  // to third parties.
  //
  // This suppresses the scheduled cycles as well as the initial one. Skipping
  // only the initial fetch would still leave the RSS cron free to fire mid-run
  // whenever the wall clock happened to land on its interval.
  if (process.env.DISABLE_SCHEDULED_FETCH === "1") {
    console.info("[JOBS] DISABLE_SCHEDULED_FETCH=1 — RSS ve AI görevleri devre dışı.");
    return;
  }

  /* ── RSS Feed + Event Extraction (gercek zamanli) ── */
  cron.schedule(
    "*/10 * * * * *",
    scheduledTask("rss", async () => {
      const now = new Date();
      const every = getNumberSetting("rss.interval", 5, 1, 60);
      const gate = shouldRunEvery(every, now, lastRssMinuteKey);
      if (!gate.run) return;
      lastRssMinuteKey = gate.nextKey;
      await runRssCycle(io);
    })
  );

  /* ── AI Summarize (dinamik interval) ── */
  cron.schedule(
    "* * * * *",
    scheduledTask("ai", async () => {
      const now = new Date();
      const every = getNumberSetting("ai.interval", 1, 1, 60);
      const gate = shouldRunEvery(every, now, lastAiMinuteKey);
      if (!gate.run) return;
      lastAiMinuteKey = gate.nextKey;

      await runAiCycle(io);
    })
  );

  /* ── İlk çalışma: backend başlar başlamaz ── */
  // scheduledTask() rather than a bare try/catch: setImmediate does not adopt
  // the returned promise, so an unguarded rejection here would reach
  // index.ts's unhandledRejection handler and exit the process at boot.
  void scheduledTask("rss:initial", async () => {
    console.warn("[RSS] İlk tarama başlatılıyor…");
    lastRssMinuteKey = minuteKey(new Date());
    await runRssCycle(io);

    // AI özetleme 30 saniye sonra başlasın (RSS'in bitmesini bekle)
    setTimeout(() => {
      void scheduledTask("ai:initial", () => runAiCycle(io))();
    }, 30_000);
  })();
}
