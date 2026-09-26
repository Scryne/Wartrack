import fs from "fs/promises";

/**
 * D7: processQueue had no try/finally, so a throw left `processing === true`
 * forever. Every later enqueue then returned at the guard, the queue never
 * drained, and callers' promises never settled — HTTP requests hung open.
 *
 * vitest.config.ts points OLLAMA_URL at a closed port and blanks the Gemini
 * key, so no provider answers and every item settles as model "none".
 */

const TEST_DB_RELATIVE_PATH = `./wartracker.queue.${process.pid}.db`;

beforeAll(async () => {
  process.env.DB_PATH = TEST_DB_RELATIVE_PATH;
  process.env.GEMINI_API_KEY = "";
  await import("../src/db");
});

afterAll(async () => {
  const { default: db, DATABASE_PATH } = await import("../src/db");
  db.close();
  await fs.unlink(DATABASE_PATH).catch(() => undefined);
  for (const suffix of ["-wal", "-shm"]) {
    await fs.unlink(`${DATABASE_PATH}${suffix}`).catch(() => undefined);
  }
});

describe("summarize queue", () => {
  it("settles every enqueued item and resets the processing flag", async () => {
    const { summarizeArticle, getQueueStatus } = await import(
      "../src/services/summarize.service"
    );

    const results = await Promise.all([
      summarizeArticle(1, "Israeli airstrike reported near Beirut"),
      summarizeArticle(2, "Ceasefire talks continue in Doha"),
      summarizeArticle(3, "Tanker traffic slows near Hormuz")
    ]);

    expect(results).toHaveLength(3);
    for (const result of results) {
      expect(result.model).toBe("none");
    }

    const status = getQueueStatus();
    expect(status.processing).toBe(false);
    expect(status.queueLength).toBe(0);
  });

  it("stays usable for a second batch (the queue did not wedge)", async () => {
    const { summarizeArticle, getQueueStatus } = await import(
      "../src/services/summarize.service"
    );

    const result = await summarizeArticle(4, "Drone intercepted over the Red Sea");

    expect(result.model).toBe("none");
    expect(getQueueStatus().processing).toBe(false);
  });

  it("coalesces concurrent requests for the same article", async () => {
    const { summarizeArticle, getQueueStatus } = await import(
      "../src/services/summarize.service"
    );

    // Overlapping cron runs select the same unsummarized rows, because
    // aiSummary is only written once summarisation completes.
    const [a, b, c] = await Promise.all([
      summarizeArticle(99, "Missile strike reported in Isfahan"),
      summarizeArticle(99, "Missile strike reported in Isfahan"),
      summarizeArticle(99, "Missile strike reported in Isfahan")
    ]);

    expect(a.summary).toBe(b.summary);
    expect(b.summary).toBe(c.summary);
    expect(getQueueStatus().queueLength).toBe(0);
  });

  it("writes no summary when no provider answers, so the article is retried later", async () => {
    const { summarizeArticle } = await import("../src/services/summarize.service");

    const result = await summarizeArticle(5, "Airstrike wounded civilians at a hospital");

    // A canned sentence stored here used to be shown as this article's AI
    // summary. An empty result leaves aiSummary NULL for the next cycle.
    expect(result.model).toBe("none");
    expect(result.summary).toBe("");
  });
});
