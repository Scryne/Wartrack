import fs from "fs";
import { TEST_SCRATCH_DIR } from "./testPaths";

/**
 * Every test run gets a clean scratch directory for its database and backups,
 * and removes it afterwards.
 *
 * Several suites import src/db directly and clear tables with DELETE FROM.
 * Before this existed they opened the path from .env — the operator's live
 * wartracker.db — so running the tests erased real articles and events.
 */
export default function setup(): () => void {
  fs.rmSync(TEST_SCRATCH_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_SCRATCH_DIR, { recursive: true });
  return () => {
    fs.rmSync(TEST_SCRATCH_DIR, { recursive: true, force: true });
  };
}
