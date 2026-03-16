import db from "./index";

export function runMigrations(): void {
  const migration = db.transaction(() => {
    db.exec(`
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
    `);

    try {
      db.prepare(`ALTER TABLE articles ADD COLUMN lat REAL`).run();
    } catch {
      // already exists
    }

    try {
      db.prepare(`ALTER TABLE articles ADD COLUMN lng REAL`).run();
    } catch {
      // already exists
    }

    try {
      db.prepare(`ALTER TABLE events ADD COLUMN articleId INTEGER`).run();
    } catch {
      // already exists
    }

    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_events_articleId ON events(articleId) WHERE articleId IS NOT NULL`).run();

    db.prepare(`CREATE TABLE IF NOT EXISTS bookmarks (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      articleId INTEGER NOT NULL UNIQUE,
      createdAt TEXT DEFAULT (datetime('now'))
    )`).run();
  });

  migration();
}
