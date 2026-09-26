import path from "path";
import { defineConfig } from "vitest/config";
import { TEST_SCRATCH_DIR } from "./test/testPaths";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globals: true,
    fileParallelism: false,
    globalSetup: ["./test/globalSetup.ts"],
    // The suite must never reach the operator's data. Without these, tests that
    // import src/db opened DB_PATH from .env (the live wartracker.db) and wiped
    // it with DELETE FROM, and API tests wrote real backups into ./backups where
    // retention pruned the operator's snapshots. dotenv does not override
    // variables that are already set, so these win over .env.
    env: {
      DB_PATH: path.join(TEST_SCRATCH_DIR, "wartracker.test.db"),
      BACKUP_DIR: path.join(TEST_SCRATCH_DIR, "backups"),
      // Tests must never reach a real model: a developer running Ollama would
      // otherwise make the suite slow and its results depend on model output.
      OLLAMA_URL: "http://127.0.0.1:9",
      GEMINI_API_KEY: ""
    }
  }
});
