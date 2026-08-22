import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { MIGRATION_VERSIONS, runMigrations } from "../db/migrate";

/**
 * Migration gate for CI.
 *
 * The test suite exercises migrations against a *seeded legacy* database,
 * which is the upgrade path. This script covers the other one: a completely
 * fresh database, the case a new deployment actually hits. A migration that
 * only works when a previous schema is present passes the suite and fails on
 * first install.
 *
 * It also asserts the properties that are easy to break and expensive to
 * discover late: idempotency, referential integrity afterwards, and that the
 * constraints the application relies on are really in the schema rather than
 * only in the validation layer.
 *
 * Runs standalone (no server, no DB_PATH) against a temp file it deletes.
 */

interface Check {
  name: string;
  run: (db: Database.Database) => void;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const CHECKS: Check[] = [
  {
    name: "every declared migration is recorded",
    run: (db) => {
      const applied = (
        db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as {
          version: number;
        }[]
      ).map((row) => row.version);

      assert(
        JSON.stringify(applied) === JSON.stringify(MIGRATION_VERSIONS),
        `schema_migrations holds [${applied}], expected [${MIGRATION_VERSIONS}]`
      );
    }
  },
  {
    name: "expected tables exist",
    run: (db) => {
      const tables = new Set(
        (
          db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
            name: string;
          }[]
        ).map((row) => row.name)
      );

      for (const table of ["articles", "events", "pins", "settings", "bookmarks"]) {
        assert(tables.has(table), `missing table: ${table}`);
      }
    }
  },
  {
    name: "pins enforce real-world coordinates at the schema level",
    run: (db) => {
      const insert = db.prepare(
        "INSERT INTO pins (lat, lng, title, description, category) VALUES (?,?,?,?,?)"
      );

      for (const [lat, lng, label] of [
        [9999, 0, "latitude above 90"],
        [0, -181, "longitude below -180"]
      ] as const) {
        let rejected = false;
        try {
          insert.run(lat, lng, "bad", "", "info");
        } catch {
          rejected = true;
        }
        assert(rejected, `schema accepted ${label}`);
      }

      insert.run(32.1, 36.7, "valid", "", "info");
      db.prepare("DELETE FROM pins WHERE title = 'valid'").run();
    }
  },
  {
    name: "foreign keys are declared and enforced",
    run: (db) => {
      db.pragma("foreign_keys = ON");

      db.prepare(
        `INSERT INTO articles (guid, title, link, pubDate, source, category)
         VALUES ('fk-1','t','https://e.test/1','2026-01-01T00:00:00.000Z','s','haber')`
      ).run();
      const articleId = (
        db.prepare("SELECT id FROM articles WHERE guid = 'fk-1'").get() as { id: number }
      ).id;

      db.prepare("INSERT INTO bookmarks (articleId) VALUES (?)").run(articleId);
      db.prepare("DELETE FROM articles WHERE id = ?").run(articleId);

      const orphans = (
        db.prepare("SELECT COUNT(*) AS cnt FROM bookmarks WHERE articleId = ?").get(articleId) as {
          cnt: number;
        }
      ).cnt;
      assert(orphans === 0, "ON DELETE CASCADE did not remove the bookmark");
    }
  },
  {
    name: "no foreign key violations after migrating",
    run: (db) => {
      const violations = db.pragma("foreign_key_check") as unknown[];
      assert(violations.length === 0, `foreign_key_check reported ${violations.length} rows`);
    }
  },
  {
    name: "timestamp defaults are ISO-8601 UTC, not SQLite-native",
    run: (db) => {
      db.prepare(
        `INSERT INTO articles (guid, title, link, pubDate, source, category)
         VALUES ('iso-1','t','https://e.test/2','2026-01-01T00:00:00.000Z','s','haber')`
      ).run();

      const { createdAt } = db
        .prepare("SELECT createdAt FROM articles WHERE guid = 'iso-1'")
        .get() as { createdAt: string };

      assert(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(createdAt),
        `createdAt default is "${createdAt}", expected ISO-8601 UTC`
      );
    }
  }
];

function main(): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wartracker-migrate-"));
  const file = path.join(dir, "check.db");
  let failures = 0;

  try {
    const db = new Database(file);
    db.pragma("journal_mode = WAL");

    console.info("[MIGRATE] Applying migrations to a fresh database…");
    runMigrations(db);

    // Idempotency: a second pass must apply nothing. This is what stops a
    // destructive migration from re-running on every boot.
    const before = db.prepare("SELECT COUNT(*) AS cnt FROM schema_migrations").get() as {
      cnt: number;
    };
    runMigrations(db);
    const after = db.prepare("SELECT COUNT(*) AS cnt FROM schema_migrations").get() as {
      cnt: number;
    };

    if (before.cnt !== after.cnt) {
      console.error(`  ✗ migrations are not idempotent (${before.cnt} -> ${after.cnt})`);
      failures++;
    } else {
      console.info("  ✓ migrations are idempotent");
    }

    for (const check of CHECKS) {
      try {
        check.run(db);
        console.info(`  ✓ ${check.name}`);
      } catch (err) {
        console.error(`  ✗ ${check.name}: ${err instanceof Error ? err.message : err}`);
        failures++;
      }
    }

    db.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`[MIGRATE] ${failures} check(s) failed.`);
    process.exit(1);
  }

  console.info("[MIGRATE] All migration checks passed.");
}

main();
