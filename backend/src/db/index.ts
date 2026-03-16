import path from "path";
import Database from "better-sqlite3";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const projectRoot = path.resolve(__dirname, "../../..");
const configuredPath = process.env.DB_PATH ?? "./wartracker.db";
const databasePath = path.resolve(projectRoot, configuredPath);

const db = new Database(databasePath);
db.pragma("journal_mode = WAL");

export default db;
