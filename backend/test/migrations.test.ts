import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { sqliteIsoNow, isIsoTimestamp, toIsoOrNull } from "../src/lib/time";

/**
 * Proves the D1/D4/D8 root-cause fix: createdAt was stored in SQLite's native
 * "YYYY-MM-DD HH:MM:SS" while pubDate used ISO-8601, and the two were compared
 * as TEXT. ' ' (0x20) sorts before 'T' (0x54), so every comparison was wrong.
 */

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const DB_FILE = path.resolve(PROJECT_ROOT, `./wartracker.migtest.${process.pid}.db`);

function removeDbFiles() {
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(`${DB_FILE}${suffix}`, { force: true });
  }
}

/** Recreate the pre-migration schema exactly as it shipped. */
function seedLegacyDatabase() {
  const legacy = new Database(DB_FILE);
  legacy.exec(`
    CREATE TABLE articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guid TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      link TEXT NOT NULL,
      pubDate TEXT,
      source TEXT,
      category TEXT,
      aiSummary TEXT,
      lat REAL,
      lng REAL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      articleId INTEGER,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      severity TEXT,
      source TEXT,
      lat REAL,
      lng REAL,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE pins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lat REAL NOT NULL, lng REAL NOT NULL,
      title TEXT NOT NULL, description TEXT, category TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY, value TEXT,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      articleId INTEGER NOT NULL UNIQUE,
      createdAt TEXT DEFAULT (datetime('now'))
    );
  `);

  // Legacy-format rows: naive createdAt, ISO pubDate.
  legacy
    .prepare(
      `INSERT INTO articles (id, guid, title, link, pubDate, source, category, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(1, "g-1", "Legacy article", "https://e.test/1",
      "2026-08-07T00:01:00.000Z", "Reuters World", "haber", "2026-08-07 00:01:00");

  legacy
    .prepare(
      `INSERT INTO events (id, articleId, type, title, severity, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(1, 1, "kritik", "Legacy event", "5", "2026-08-07 13:00:00");

  // Orphans that must not survive the foreign keys added in migration 2.
  legacy.prepare(`INSERT INTO bookmarks (articleId) VALUES (?)`).run(1);
  legacy.prepare(`INSERT INTO bookmarks (articleId) VALUES (?)`).run(9999);
  legacy
    .prepare(`INSERT INTO events (articleId, type, title, severity, createdAt) VALUES (?,?,?,?,?)`)
    .run(9999, "kritik", "Orphan-linked event", "5", "2026-08-07 13:00:00");

  // Low-severity event that migration 3 must prune.
  legacy
    .prepare(`INSERT INTO events (type, title, severity, createdAt) VALUES (?,?,?,?)`)
    .run("genel", "Low severity", "1", "2026-08-07 13:00:00");

  // Coordinates the old routes/pins.ts accepted (it checked Number.isFinite
  // only). Migration 5 must remove them and the new CHECK must refuse more.
  const insertPin = legacy.prepare(
    `INSERT INTO pins (lat, lng, title, description, category, createdAt, updatedAt)
     VALUES (?,?,?,?,?,?,?)`
  );
  insertPin.run(9999, -99999, "Off-planet pin", "", "info", "2026-08-07 13:00:00", "2026-08-07 13:00:00");
  insertPin.run(32.1, 36.7, "Valid pin", "", "strike", "2026-08-07 13:00:00", "2026-08-07 13:00:00");

  legacy.close();
}

beforeAll(() => {
  removeDbFiles();
  seedLegacyDatabase();
  process.env.DB_PATH = path.relative(PROJECT_ROOT, DB_FILE).split(path.sep).join("/");
});

afterAll(async () => {
  const { default: db } = await import("../src/db");
  db.close();
  removeDbFiles();
});

describe("timestamp normalization migration (D1/D4/D8)", () => {
  it("records every declared migration in schema_migrations", async () => {
    const { default: db } = await import("../src/db");
    const { MIGRATION_VERSIONS } = await import("../src/db/migrate");
    const rows = db
      .prepare("SELECT version, name FROM schema_migrations ORDER BY version")
      .all() as { version: number; name: string }[];

    // Derived from the migration list rather than hardcoded, so adding one
    // does not fail this test for no reason. What is actually asserted is that
    // every declared migration ran, and that versions are unique and ascending.
    expect(rows.map((r) => r.version)).toEqual(MIGRATION_VERSIONS);
    expect(MIGRATION_VERSIONS).toEqual([...MIGRATION_VERSIONS].sort((a, b) => a - b));
    expect(new Set(MIGRATION_VERSIONS).size).toBe(MIGRATION_VERSIONS.length);
  });

  it("backfills legacy createdAt values to ISO-8601 UTC", async () => {
    const { default: db } = await import("../src/db");

    const article = db.prepare("SELECT createdAt FROM articles WHERE id = 1").get() as {
      createdAt: string;
    };
    const event = db.prepare("SELECT createdAt FROM events WHERE id = 1").get() as {
      createdAt: string;
    };

    expect(article.createdAt).toBe("2026-08-07T00:01:00.000Z");
    expect(event.createdAt).toBe("2026-08-07T13:00:00.000Z");
    expect(isIsoTimestamp(article.createdAt)).toBe(true);
    expect(isIsoTimestamp(event.createdAt)).toBe(true);
  });

  it("leaves already-ISO pubDate untouched", async () => {
    const { default: db } = await import("../src/db");
    const row = db.prepare("SELECT pubDate FROM articles WHERE id = 1").get() as {
      pubDate: string;
    };
    expect(row.pubDate).toBe("2026-08-07T00:01:00.000Z");
  });

  it("stores new rows with an ISO-8601 default, not CURRENT_TIMESTAMP", async () => {
    const { default: db } = await import("../src/db");
    db.prepare(
      `INSERT INTO articles (guid, title, link, pubDate, source, category)
       VALUES ('g-new','New','https://e.test/n','2026-08-07T10:00:00.000Z','BBC World','haber')`
    ).run();

    const row = db
      .prepare("SELECT createdAt FROM articles WHERE guid = 'g-new'")
      .get() as { createdAt: string };

    expect(isIsoTimestamp(row.createdAt)).toBe(true);
    // Parses as UTC, not as local time (the D4 failure).
    expect(Math.abs(Date.parse(row.createdAt) - Date.now())).toBeLessThan(60_000);
  });

  it("D8: the 6-hour window excludes a same-day article that is ~23h old", async () => {
    const { default: db } = await import("../src/db");

    // Anchor "now" at 17:00 on the same calendar day as the seeded 00:01 row.
    // Pre-fix, '2026-08-07T00:01:00.000Z' > '2026-08-07 11:00:00' was TRUE
    // because 'T' > ' ', so a 23-hour-old article passed a 6-hour filter.
    // Scoped to the seeded row so the assertion does not depend on what other
    // tests in this file have inserted.
    const within = db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM articles
          WHERE id = 1
            AND pubDate > strftime('%Y-%m-%dT%H:%M:%fZ','2026-08-07 17:00:00','-6 hours')`
      )
      .get() as { cnt: number };

    expect(within.cnt).toBe(0);

    // Guard that this test is meaningful: the original expression, which
    // compared ISO pubDate against SQLite's space-separated datetime(), still
    // wrongly includes that same row.
    const legacyBehaviour = db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM articles
          WHERE id = 1
            AND pubDate > datetime('2026-08-07 17:00:00','-6 hours')`
      )
      .get() as { cnt: number };

    expect(legacyBehaviour.cnt).toBe(1);
  });

  it("D1: an event newer than the cutoff compares greater, same-day", async () => {
    const { default: db } = await import("../src/db");

    // The exact comparison calcThreatLevel performs, now both sides ISO.
    const cutoff = "2026-08-07T11:01:45.719Z";
    const row = db.prepare("SELECT createdAt FROM events WHERE id = 1").get() as {
      createdAt: string;
    };

    expect(row.createdAt > cutoff).toBe(true);
    expect(Date.parse(row.createdAt)).toBeGreaterThan(Date.parse(cutoff));
  });

  it("keeps lexicographic ordering equal to chronological ordering", async () => {
    const { default: db } = await import("../src/db");
    const rows = db
      .prepare("SELECT createdAt FROM articles ORDER BY createdAt DESC")
      .all() as { createdAt: string }[];

    const byString = rows.map((r) => r.createdAt);
    const byTime = [...byString].sort((a, b) => Date.parse(b) - Date.parse(a));
    expect(byString).toEqual(byTime);
  });
});

describe("data migrations moved out of module scope (D2)", () => {
  it("migration 3 pruned severity < 3 events", async () => {
    const { default: db } = await import("../src/db");
    const row = db
      .prepare("SELECT COUNT(*) AS cnt FROM events WHERE CAST(severity AS INTEGER) < 3")
      .get() as { cnt: number };
    expect(row.cnt).toBe(0);
  });

  it("is idempotent: re-running applies nothing and changes nothing", async () => {
    const { default: db } = await import("../src/db");
    const { runMigrations } = await import("../src/db/migrate");

    const before = db.prepare("SELECT createdAt FROM events WHERE id = 1").get();
    const countBefore = db
      .prepare("SELECT COUNT(*) AS cnt FROM schema_migrations")
      .get() as { cnt: number };

    runMigrations(db);

    const after = db.prepare("SELECT createdAt FROM events WHERE id = 1").get();
    const countAfter = db
      .prepare("SELECT COUNT(*) AS cnt FROM schema_migrations")
      .get() as { cnt: number };

    expect(after).toEqual(before);
    expect(countAfter.cnt).toBe(countBefore.cnt);
  });
});

describe("coordinate constraints (migration 5)", () => {
  it("removed pins that were never on Earth and kept the valid one", async () => {
    const { default: db } = await import("../src/db");

    const offPlanet = db
      .prepare("SELECT COUNT(*) AS cnt FROM pins WHERE title = 'Off-planet pin'")
      .get() as { cnt: number };
    const valid = db
      .prepare("SELECT COUNT(*) AS cnt FROM pins WHERE title = 'Valid pin'")
      .get() as { cnt: number };

    expect(offPlanet.cnt).toBe(0);
    expect(valid.cnt).toBe(1);
  });

  it("refuses an out-of-range coordinate at the schema level", async () => {
    const { default: db } = await import("../src/db");
    const insert = db.prepare(
      "INSERT INTO pins (lat, lng, title, description, category) VALUES (?,?,?,?,?)"
    );

    expect(() => insert.run(9999, 0, "bad lat", "", "info")).toThrow(/CHECK constraint/i);
    expect(() => insert.run(0, -181, "bad lng", "", "info")).toThrow(/CHECK constraint/i);
    expect(() => insert.run(0, 0, "", "", "info")).toThrow(/CHECK constraint/i);
    expect(() => insert.run(32.1, 36.7, "fine", "", "info")).not.toThrow();
  });
});

describe("foreign keys (D18)", () => {
  it("dropped orphaned bookmarks and nulled orphaned event links", async () => {
    const { default: db } = await import("../src/db");

    const orphanBookmark = db
      .prepare("SELECT COUNT(*) AS cnt FROM bookmarks WHERE articleId = 9999")
      .get() as { cnt: number };
    const orphanEvent = db
      .prepare("SELECT articleId FROM events WHERE title = 'Orphan-linked event'")
      .get() as { articleId: number | null } | undefined;

    expect(orphanBookmark.cnt).toBe(0);
    expect(orphanEvent?.articleId).toBeNull();
  });

  it("enforces foreign_keys and cascades article deletion", async () => {
    const { default: db } = await import("../src/db");
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);

    db.prepare("DELETE FROM articles WHERE id = 1").run();

    const bookmark = db
      .prepare("SELECT COUNT(*) AS cnt FROM bookmarks WHERE articleId = 1")
      .get() as { cnt: number };
    const event = db.prepare("SELECT articleId FROM events WHERE id = 1").get() as {
      articleId: number | null;
    };

    expect(bookmark.cnt).toBe(0); // ON DELETE CASCADE
    expect(event.articleId).toBeNull(); // ON DELETE SET NULL
  });
});

describe("time helpers", () => {
  it("sqliteIsoNow rejects modifiers it did not author", () => {
    expect(() => sqliteIsoNow("-6 hours")).not.toThrow();
    expect(() => sqliteIsoNow("'); DROP TABLE articles; --")).toThrow(/Unsafe/);
  });

  it("toIsoOrNull returns null instead of throwing on garbage feed dates", () => {
    expect(toIsoOrNull("not a date")).toBeNull();
    expect(toIsoOrNull(null)).toBeNull();
    expect(toIsoOrNull("")).toBeNull();
    expect(toIsoOrNull("Thu, 07 Aug 2026 10:00:00 GMT")).toBe("2026-08-07T10:00:00.000Z");
  });
});
