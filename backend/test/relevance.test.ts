import fs from "fs/promises";
import { type Express } from "express";
import request from "supertest";
import type { Classifier, StoryForRelevance } from "../src/services/relevance.service";

const TEST_DB_RELATIVE_PATH = `./wartracker.relevance.${process.pid}.db`;
const TEST_SECRET = "test-shared-secret-0123456789";

let app: Express;
let db: typeof import("../src/db").default;
let relevance: typeof import("../src/services/relevance.service");

/** Scores by title; a title missing from the map makes the call fail. */
function fakeClassifier(scores: Record<string, number>): Classifier & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    classify(story: StoryForRelevance) {
      calls.push(story.title);
      if (!(story.title in scores)) return Promise.reject(new Error("service unavailable"));
      return Promise.resolve({ score: scores[story.title], model: "jev-test" });
    }
  };
}

function insertArticle(title: string, placed: boolean): number {
  const now = new Date().toISOString();
  const row = db
    .prepare(
      `INSERT INTO articles (guid, title, description, link, pubDate, source, category, lat, lng, createdAt)
       VALUES (?, ?, NULL, ?, ?, 'Test', 'world', ?, ?, ?)`
    )
    .run(`guid-${title}`, title, `https://example.test/${encodeURIComponent(title)}`, now,
      placed ? 31.77 : null, placed ? 35.21 : null, now);
  return Number(row.lastInsertRowid);
}

beforeAll(async () => {
  process.env.DB_PATH = TEST_DB_RELATIVE_PATH;
  process.env.BRIEF_MODEL_ENABLED = "0";
  process.env.API_SHARED_SECRET = TEST_SECRET;
  db = (await import("../src/db")).default;
  relevance = await import("../src/services/relevance.service");
  const { createApp } = await import("../src/app");
  app = createApp(["http://localhost:5173"]);
  app.set("io", { emit: () => undefined });
});

afterAll(async () => {
  relevance.setClassifier(null);
  const { default: database, DATABASE_PATH } = await import("../src/db");
  database.close();
  await fs.unlink(DATABASE_PATH);
  for (const suffix of ["-wal", "-shm"]) {
    await fs.unlink(`${DATABASE_PATH}${suffix}`).catch((err) => {
      if (err.code !== "ENOENT") throw err;
    });
  }
});

beforeEach(() => {
  db.exec("DELETE FROM events; DELETE FROM articles;");
});

describe("topic relevance", () => {
  it("is off without a key: nothing is classified and placed stories stay in the theatre", async () => {
    relevance.setClassifier(null);
    insertArticle("Musical review: a Tel Aviv premiere", true);

    const result = await relevance.classifyPendingArticles();
    expect(result.classified).toBe(0);

    const feed = await request(app).get("/api/feed?scope=theatre");
    expect(feed.body.data.map((a: { title: string }) => a.title)).toContain("Musical review: a Tel Aviv premiere");
  });

  it("removes an off-topic placed story from the theatre feed, map pins and events", async () => {
    const strike = "Drones intercepted over Riyadh";
    const review = "Musical review: a Tel Aviv premiere";
    const fake = fakeClassifier({ [strike]: 0.97, [review]: 0.03 });
    relevance.setClassifier(fake);
    insertArticle(strike, true);
    const reviewId = insertArticle(review, true);
    // An event extracted before classification existed must go too.
    db.prepare(
      "INSERT INTO events (articleId, type, title, severity, lat, lng, createdAt) VALUES (?, 'çatışma', ?, '3', 31.77, 35.21, ?)"
    ).run(reviewId, review, new Date().toISOString());

    const result = await relevance.classifyPendingArticles();
    expect(result).toMatchObject({ classified: 2, offTopic: 1, failed: 0, removedEvents: 1 });

    const feed = await request(app).get("/api/feed?scope=theatre");
    const titles = feed.body.data.map((a: { title: string }) => a.title);
    expect(titles).toContain(strike);
    expect(titles).not.toContain(review);

    const all = await request(app).get("/api/feed");
    expect(all.body.data.map((a: { title: string }) => a.title)).toContain(review);

    const pins = await request(app).get("/api/feed/map-pins");
    const pinTitles = (pins.body.data ?? pins.body).map((a: { title: string }) => a.title);
    expect(pinTitles).not.toContain(review);

    const remaining = db.prepare("SELECT COUNT(*) AS n FROM events WHERE articleId = ?").get(reviewId) as { n: number };
    expect(remaining.n).toBe(0);
  });

  it("uses the threshold boundary in code: 0.35 is in, just below is out", async () => {
    relevance.setClassifier(fakeClassifier({ "At threshold": 0.35, "Just below": 0.3499 }));
    insertArticle("At threshold", true);
    insertArticle("Just below", true);
    await relevance.classifyPendingArticles();

    const feed = await request(app).get("/api/feed?scope=theatre");
    const titles = feed.body.data.map((a: { title: string }) => a.title);
    expect(titles).toContain("At threshold");
    expect(titles).not.toContain("Just below");
  });

  it("asks only about placed stories, and a failed call is retried on the next cycle", async () => {
    const fake = fakeClassifier({ "Placed and fine": 0.9 });
    relevance.setClassifier(fake);
    insertArticle("Placed and fine", true);
    insertArticle("Placed but the call fails", true);
    insertArticle("Not placed anywhere", false);

    const first = await relevance.classifyPendingArticles();
    expect(first).toMatchObject({ classified: 1, failed: 1 });
    expect(fake.calls).not.toContain("Not placed anywhere");

    const pending = db.prepare("SELECT title FROM articles WHERE theatreScore IS NULL AND lat IS NOT NULL").all();
    expect(pending).toEqual([{ title: "Placed but the call fails" }]);

    // Still listed while unclassified.
    const feed = await request(app).get("/api/feed?scope=theatre");
    expect(feed.body.data.map((a: { title: string }) => a.title)).toContain("Placed but the call fails");

    fake.calls.length = 0;
    await relevance.classifyPendingArticles();
    expect(fake.calls).toEqual(["Placed but the call fails"]);
  });

  it("records which model answered", async () => {
    relevance.setClassifier(fakeClassifier({ "Strike on Sanaa": 0.88 }));
    insertArticle("Strike on Sanaa", true);
    await relevance.classifyPendingArticles();
    const row = db.prepare("SELECT theatreScore, theatreModel FROM articles").get();
    expect(row).toEqual({ theatreScore: 0.88, theatreModel: "jev-test" });
  });
});
