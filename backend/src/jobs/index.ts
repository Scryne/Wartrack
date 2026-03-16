import cron from "node-cron";
import type { Server as SocketIOServer } from "socket.io";
import { fetchAllFeeds } from "../services/rss.service";
import { runSummarizeJob } from "./summarize.job";
import { clearInvalidSummaries } from "../services/summarize.service";
import { autoExtractEvents } from "../routes/events";
import { getNumberSetting } from "../services/settings.service";

let lastAiMinuteKey = "";
let lastRssMinuteKey = "";
let rssJobRunning = false;

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

export function registerJobs(io: SocketIOServer): void {
  /* ── Heartbeat (30 dk) ── */
  cron.schedule("*/30 * * * *", () => {
    io.emit("jobs:heartbeat", {
      timestamp: new Date().toISOString()
    });
  });

  /* ── RSS Feed + Event Extraction (gercek zamanli) ── */
  cron.schedule("*/10 * * * * *", async () => {
    const now = new Date();
    const every = getNumberSetting("rss.interval", 5, 1, 60);
    const gate = shouldRunEvery(every, now, lastRssMinuteKey);
    if (!gate.run) return;
    lastRssMinuteKey = gate.nextKey;
    await runRssCycle(io);
  });

  /* ── AI Summarize (dinamik interval) ── */
  cron.schedule("* * * * *", async () => {
    const now = new Date();
    const every = getNumberSetting("ai.interval", 1, 1, 60);
    const gate = shouldRunEvery(every, now, lastAiMinuteKey);
    if (!gate.run) return;
    lastAiMinuteKey = gate.nextKey;

    try {
      clearInvalidSummaries(300);
      await runSummarizeJob(io);
    } catch (err) {
      console.error("[AI] Cron error:", err);
    }
  });

  /* ── İlk çalışma: backend başlar başlamaz ── */
  setImmediate(async () => {
    try {
      console.warn("[RSS] İlk tarama başlatılıyor…");
      lastRssMinuteKey = minuteKey(new Date());
      await runRssCycle(io);

      // AI özetleme 30 saniye sonra başlasın (RSS'in bitmesini bekle)
      setTimeout(async () => {
        try {
          clearInvalidSummaries(500);
          await runSummarizeJob(io);
        } catch (err) {
          console.error("[AI] İlk özetleme hatası:", err);
        }
      }, 30_000);
    } catch (err) {
      console.error("[RSS] İlk tarama hatası:", err);
    }
  });
}
