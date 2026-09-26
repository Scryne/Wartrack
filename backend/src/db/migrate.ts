import type { Database } from "better-sqlite3";
import { sqliteIsoNow, sqliteToIso } from "../lib/time";

/**
 * Versioned, one-shot migrations.
 *
 * Every schema or data change belongs here, recorded in `schema_migrations`.
 * Nothing destructive may live at module scope in a route or service file:
 * those run on *every* import, which means every server boot and every
 * ts-node-dev respawn.
 */

interface Migration {
  version: number;
  name: string;
  up: (database: Database) => void;
}

const ISO_NOW = sqliteIsoNow();

/** Columns that stored SQLite-native "YYYY-MM-DD HH:MM:SS" before v2. */
const TIMESTAMP_COLUMNS: Array<{ table: string; column: string }> = [
  { table: "articles", column: "createdAt" },
  { table: "articles", column: "pubDate" },
  { table: "events", column: "createdAt" },
  { table: "pins", column: "createdAt" },
  { table: "pins", column: "updatedAt" },
  { table: "bookmarks", column: "createdAt" },
  { table: "settings", column: "updatedAt" }
];

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial_schema",
    up: (database) => {
      database.exec(`
        CREATE TABLE IF NOT EXISTS articles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guid TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          description TEXT,
          link TEXT NOT NULL,
          pubDate TEXT,
          source TEXT,
          category TEXT,
          aiSummary TEXT,
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS pins (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          lat REAL NOT NULL,
          lng REAL NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          category TEXT,
          createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS events (
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

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT,
          updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS bookmarks (
          id        INTEGER PRIMARY KEY AUTOINCREMENT,
          articleId INTEGER NOT NULL UNIQUE,
          createdAt TEXT DEFAULT (datetime('now'))
        );
      `);

      // Columns added after the original release; older databases lack them.
      for (const statement of [
        "ALTER TABLE articles ADD COLUMN lat REAL",
        "ALTER TABLE articles ADD COLUMN lng REAL",
        "ALTER TABLE events ADD COLUMN articleId INTEGER"
      ]) {
        try {
          database.prepare(statement).run();
        } catch {
          // Column already present.
        }
      }

      database.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_events_articleId
           ON events(articleId) WHERE articleId IS NOT NULL`
      );
    }
  },

  {
    version: 2,
    name: "normalize_schema_iso_timestamps_and_foreign_keys",
    up: (database) => {
      // ── 1. Backfill existing values to ISO-8601 UTC ──────────────────
      // Guarded by NOT LIKE '%T%Z' so re-running is a no-op.
      for (const { table, column } of TIMESTAMP_COLUMNS) {
        database.exec(
          `UPDATE ${table}
              SET ${column} = ${sqliteToIso(column)}
            WHERE ${column} IS NOT NULL
              AND ${column} NOT LIKE '%T%Z'`
        );
      }

      // ── 2. Drop rows/links that would violate the new foreign keys ───
      database.exec(`
        DELETE FROM bookmarks
         WHERE articleId NOT IN (SELECT id FROM articles);

        UPDATE events
           SET articleId = NULL
         WHERE articleId IS NOT NULL
           AND articleId NOT IN (SELECT id FROM articles);
      `);

      // ── 3. Rebuild each table with ISO defaults + foreign keys ───────
      // SQLite cannot ALTER a column default or add a foreign key in place,
      // so this follows the documented create/copy/drop/rename procedure.
      database.exec(`
        CREATE TABLE articles_new (
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
          createdAt TEXT NOT NULL DEFAULT (${ISO_NOW})
        );
        INSERT INTO articles_new
          (id, guid, title, description, link, pubDate, source, category, aiSummary, lat, lng, createdAt)
          SELECT id, guid, title, description, link, pubDate, source, category, aiSummary, lat, lng, createdAt
            FROM articles;
        DROP TABLE articles;
        ALTER TABLE articles_new RENAME TO articles;

        CREATE TABLE pins_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          lat REAL NOT NULL,
          lng REAL NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          category TEXT,
          createdAt TEXT NOT NULL DEFAULT (${ISO_NOW}),
          updatedAt TEXT NOT NULL DEFAULT (${ISO_NOW})
        );
        INSERT INTO pins_new
          (id, lat, lng, title, description, category, createdAt, updatedAt)
          SELECT id, lat, lng, title, description, category, createdAt, updatedAt
            FROM pins;
        DROP TABLE pins;
        ALTER TABLE pins_new RENAME TO pins;

        CREATE TABLE events_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          articleId INTEGER REFERENCES articles(id) ON DELETE SET NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          severity TEXT,
          source TEXT,
          lat REAL,
          lng REAL,
          createdAt TEXT NOT NULL DEFAULT (${ISO_NOW})
        );
        INSERT INTO events_new
          (id, articleId, type, title, description, severity, source, lat, lng, createdAt)
          SELECT id, articleId, type, title, description, severity, source, lat, lng, createdAt
            FROM events;
        DROP TABLE events;
        ALTER TABLE events_new RENAME TO events;

        CREATE TABLE bookmarks_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          articleId INTEGER NOT NULL UNIQUE REFERENCES articles(id) ON DELETE CASCADE,
          createdAt TEXT NOT NULL DEFAULT (${ISO_NOW})
        );
        INSERT INTO bookmarks_new (id, articleId, createdAt)
          SELECT id, articleId, COALESCE(createdAt, ${ISO_NOW}) FROM bookmarks;
        DROP TABLE bookmarks;
        ALTER TABLE bookmarks_new RENAME TO bookmarks;

        CREATE TABLE settings_new (
          key TEXT PRIMARY KEY,
          value TEXT,
          updatedAt TEXT NOT NULL DEFAULT (${ISO_NOW})
        );
        INSERT INTO settings_new (key, value, updatedAt)
          SELECT key, value, updatedAt FROM settings;
        DROP TABLE settings;
        ALTER TABLE settings_new RENAME TO settings;
      `);

      // ── 4. Recreate indexes dropped along with the old tables ────────
      database.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_events_articleId
          ON events(articleId) WHERE articleId IS NOT NULL;

        -- Feed queries all sort by pubDate DESC over the full table.
        CREATE INDEX IF NOT EXISTS idx_articles_pubDate ON articles(pubDate DESC);
        CREATE INDEX IF NOT EXISTS idx_articles_createdAt ON articles(createdAt);
        CREATE INDEX IF NOT EXISTS idx_events_createdAt ON events(createdAt);
      `);
    }
  },

  {
    version: 3,
    name: "prune_low_severity_events",
    up: (database) => {
      // Was a module-scope statement in routes/events.ts, re-running on every
      // import (every boot, every ts-node-dev respawn).
      database.exec("DELETE FROM events WHERE CAST(severity AS INTEGER) < 3");
    }
  },

  {
    version: 4,
    name: "clear_corrupt_ai_summaries",
    up: (database) => {
      // Was a module-scope statement in services/summarize.service.ts.
      // `instr(...,'\u00')` replaces the original LIKE '%\u00%', which had no
      // ESCAPE clause and therefore also matched a literal backslash sequence;
      // instr() makes that literal intent explicit.
      database.exec(`
        UPDATE articles
           SET aiSummary = NULL
         WHERE aiSummary IS NOT NULL
           AND (
                instr(aiSummary, 'â€') > 0
             OR instr(aiSummary, '&#') > 0
             OR instr(aiSummary, '\\u00') > 0
             OR LENGTH(aiSummary) < 20
             OR instr(LOWER(aiSummary), 'özetlemek') > 0
             OR instr(LOWER(aiSummary), 'istiyorsanız') > 0
             OR instr(LOWER(aiSummary), 'yazabilirsiniz') > 0
             OR instr(LOWER(aiSummary), 'bu metni') > 0
           )
      `);
    }
  },

  {
    version: 5,
    name: "constrain_coordinates_to_earth",
    up: (database) => {
      // routes/pins.ts validated only Number.isFinite, so lat=9999 was accepted
      // and stored, as was `lat: null` (Number(null) === 0) which put a pin at
      // 0°,0°. Leaflet renders both as a plausible-looking location rather than
      // as bad data.
      //
      // The application check is what returns a useful 400; this constraint is
      // the backstop that holds the invariant regardless of which code path
      // writes, including a direct sqlite3 session.
      database.exec(`
        DELETE FROM pins
         WHERE lat IS NULL OR lng IS NULL
            OR lat < -90 OR lat > 90 OR lng < -180 OR lng > 180;

        UPDATE events
           SET lat = NULL, lng = NULL
         WHERE lat < -90 OR lat > 90 OR lng < -180 OR lng > 180;

        UPDATE articles
           SET lat = NULL, lng = NULL
         WHERE lat < -90 OR lat > 90 OR lng < -180 OR lng > 180;
      `);

      database.exec(`
        CREATE TABLE pins_v5 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          lat REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
          lng REAL NOT NULL CHECK (lng BETWEEN -180 AND 180),
          title TEXT NOT NULL CHECK (LENGTH(title) BETWEEN 1 AND 200),
          description TEXT,
          category TEXT,
          createdAt TEXT NOT NULL DEFAULT (${ISO_NOW}),
          updatedAt TEXT NOT NULL DEFAULT (${ISO_NOW})
        );
        INSERT INTO pins_v5 (id, lat, lng, title, description, category, createdAt, updatedAt)
          SELECT id, lat, lng, SUBSTR(title, 1, 200), description, category, createdAt, updatedAt
            FROM pins;
        DROP TABLE pins;
        ALTER TABLE pins_v5 RENAME TO pins;
      `);
    }
  },

  {
    version: 6,
    name: "fts5_search_index",
    up: (database) => {
      // FTS5 virtual table for instant full-text search across articles.
      database.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
          title,
          description,
          content='articles',
          content_rowid='id'
        );

        INSERT INTO articles_fts(rowid, title, description)
          SELECT id, title, description FROM articles;

        CREATE TRIGGER IF NOT EXISTS articles_fts_ai AFTER INSERT ON articles BEGIN
          INSERT INTO articles_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
        END;

        CREATE TRIGGER IF NOT EXISTS articles_fts_ad AFTER DELETE ON articles BEGIN
          INSERT INTO articles_fts(articles_fts, rowid, title, description) VALUES('delete', old.id, old.title, old.description);
        END;

        CREATE TRIGGER IF NOT EXISTS articles_fts_au AFTER UPDATE ON articles BEGIN
          INSERT INTO articles_fts(articles_fts, rowid, title, description) VALUES('delete', old.id, old.title, old.description);
          INSERT INTO articles_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
        END;
      `);
    }
  },

  {
    version: 7,
    name: "clear_canned_rule_summaries",
    up: (database) => {
      // The summarizer's no-provider fallback used to store one of these fixed
      // sentences as aiSummary. They describe no article, so they are removed
      // and the articles re-enter the summarization queue.
      database.exec(`
        UPDATE articles
           SET aiSummary = NULL
         WHERE aiSummary IN (
           'Kaynak habere göre bölgede askeri saldırı kaynaklı güvenlik baskısı sürüyor ve sivil etki riski öne çıkıyor.',
           'Kaynak habere göre bölgede askeri hareketlilik ve saldırı odaklı güvenlik riski artış eğiliminde.',
           'Kaynak habere göre diplomatik temaslar sürerken sahadaki gerilim tamamen düşmüş görünmüyor.',
           'Kaynak habere göre enerji ve lojistik hatları üzerindeki baskı bölgesel risk seviyesini etkiliyor.',
           'Kaynak habere göre bölgesel güvenlik ortamı dalgalı seyrediyor ve durum yakından izlenmeye devam ediyor.'
         )
      `);
    }
  }
];

/** Declared versions, ascending. Exported so tests assert against the source
 *  of truth instead of a hardcoded copy that drifts. */
export const MIGRATION_VERSIONS: number[] = MIGRATIONS.map((m) => m.version).sort(
  (a, b) => a - b
);

/**
 * Apply any outstanding migrations.
 *
 * Called by db/index.ts at connection-open time, before any other module can
 * run a module-scope db.prepare(). better-sqlite3 compiles statements eagerly,
 * so a prepare() against a not-yet-created table throws "no such table".
 */
export function runMigrations(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version   INTEGER PRIMARY KEY,
      name      TEXT NOT NULL,
      appliedAt TEXT NOT NULL
    )
  `);

  const applied = new Set(
    (database.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map(
      (row) => row.version
    )
  );

  // Sort by version rather than trusting array order. A migration appended in
  // the wrong place would otherwise run out of sequence — and since each one
  // builds on the schema the previous left behind, that fails in confusing
  // ways or, worse, succeeds against the wrong shape.
  const ordered = [...MIGRATIONS].sort((a, b) => a.version - b.version);

  const duplicate = ordered.find((m, i) => i > 0 && m.version === ordered[i - 1].version);
  if (duplicate) {
    throw new Error(`[DB] Duplicate migration version: ${duplicate.version}`);
  }

  const pending = ordered.filter((migration) => !applied.has(migration.version));
  if (pending.length === 0) return;

  const record = database.prepare(
    `INSERT INTO schema_migrations (version, name, appliedAt) VALUES (?, ?, ${ISO_NOW})`
  );

  // Table rebuilds must not cascade through foreign keys while in progress.
  // PRAGMA foreign_keys is a no-op inside a transaction, so it is set out here.
  database.pragma("foreign_keys = OFF");

  try {
    for (const migration of pending) {
      const apply = database.transaction(() => {
        migration.up(database);
        record.run(migration.version, migration.name);
      });

      apply();
      console.info(`[DB] Migration ${migration.version} applied: ${migration.name}`);
    }

    const violations = database.pragma("foreign_key_check") as unknown[];
    if (violations.length > 0) {
      throw new Error(
        `[DB] Foreign key violations after migration: ${JSON.stringify(violations)}`
      );
    }
  } finally {
    database.pragma("foreign_keys = ON");
  }
}
