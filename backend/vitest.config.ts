import os from "os";
import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globals: true,
    fileParallelism: false,
    // API tests trigger real backups. Without this they landed in the project's
    // own backups/ folder, and retention then pruned the operator's snapshots.
    env: {
      BACKUP_DIR: path.join(os.tmpdir(), "wartrack-test-backups")
    }
  }
});
