import os from "os";
import path from "path";
import { DATABASE_PATH, PROJECT_ROOT } from "../src/db";
import { resolveBackupDir } from "../src/services/backup.service";

/**
 * Guard for vitest.config.ts. If the scratch paths ever stop reaching the
 * workers, suites that clear tables would be running against the operator's
 * live database again; fail loudly here instead of silently erasing data.
 */
describe("test isolation", () => {
  it("opens a scratch database, never the project's own", () => {
    expect(DATABASE_PATH.startsWith(os.tmpdir())).toBe(true);
    expect(DATABASE_PATH).not.toBe(path.join(PROJECT_ROOT, "wartracker.db"));
  });

  it("writes backups to scratch space, never ./backups", () => {
    const dir = resolveBackupDir();
    expect(dir.startsWith(os.tmpdir())).toBe(true);
    expect(dir).not.toBe(path.join(PROJECT_ROOT, "backups"));
  });
});
