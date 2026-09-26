import os from "os";
import path from "path";

/** Per-process scratch area shared by vitest.config.ts and globalSetup.ts. */
export const TEST_SCRATCH_DIR = path.join(os.tmpdir(), `wartrack-test-${process.pid}`);
