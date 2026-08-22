import path from "path";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import { runMigrations } from "./migrate";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

/** Repository root. DB_PATH is resolved relative to this, not to cwd. */
export const PROJECT_ROOT = path.resolve(__dirname, "../../..");

const configuredPath = process.env.DB_PATH ?? "./wartracker.db";

/** Absolute path of the open database file. Exported so tests clean up the
 *  file that was actually created rather than recomputing the path. */
export const DATABASE_PATH = path.resolve(PROJECT_ROOT, configuredPath);

const db = new Database(DATABASE_PATH);
db.pragma("journal_mode = WAL");

// Migrations must run before any other module's module-scope db.prepare(),
// which better-sqlite3 compiles eagerly and which therefore throws
// "no such table" against a fresh database.
runMigrations(db);

// Enforce the foreign keys added in migration 2. SQLite defaults this OFF,
// so without it ON DELETE CASCADE / SET NULL are silently inert.
db.pragma("foreign_keys = ON");

export default db;
