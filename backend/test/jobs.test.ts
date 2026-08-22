import { jobMetrics, recordJobFailure, resetJobMetrics } from "../src/lib/jobMetrics";

/**
 * Scheduled-task failures must be visible.
 *
 * node-cron v3 inspects what a task returns and, for a Promise, attaches its
 * own .catch() that emits 'task-failed' on an internal Task object. Callers
 * get no handle on that object, so nothing can subscribe: a throwing tick is
 * swallowed in total silence.
 *
 * That is good for uptime and bad for operations. The RSS cron reads
 * getNumberSetting() *outside* runRssCycle's try/catch, so a database error
 * there could fail every tick — stopping ingestion permanently — while the
 * process stayed healthy and no log line was ever written.
 */

beforeEach(() => {
  resetJobMetrics();
});

describe("node-cron swallows async task rejections", () => {
  it("catches a rejected task without crashing, and reports nothing", async () => {
    const cron = (await import("node-cron")).default;
    const errors: unknown[] = [];

    // Register a task that always throws, then run it the way the scheduler
    // does. If node-cron ever stops catching this, the rejection becomes an
    // unhandledRejection — which index.ts turns into process.exit(1).
    // eslint-disable-next-line @typescript-eslint/require-await -- must return a rejected promise
    const task = cron.schedule("* * * * * *", async () => {
      throw new Error("simulated tick failure");
    });

    process.once("unhandledRejection", (reason) => errors.push(reason));

    // Two seconds is enough for at least one tick of a per-second schedule.
    await new Promise((resolve) => setTimeout(resolve, 2_100));
    task.stop();

    expect(errors).toEqual([]);
  }, 10_000);
});

describe("scheduledTask makes a swallowed failure observable", () => {
  it("counts and attributes a failing run", async () => {
    const { scheduledTask } = await import("../src/jobs");

    const failing = scheduledTask("rss", () => Promise.reject(new Error("db locked")));
    await failing();

    expect(jobMetrics.job_run_total).toBe(1);
    expect(jobMetrics.job_failure_total).toBe(1);
    expect(jobMetrics.last_failure_job).toBe("rss");
    expect(jobMetrics.last_failure_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("does not rethrow, so the scheduler keeps ticking", async () => {
    const { scheduledTask } = await import("../src/jobs");

    const failing = scheduledTask("ai", () => Promise.reject(new Error("boom")));

    await expect(failing()).resolves.toBeUndefined();
  });

  it("leaves the failure counters alone on a successful run", async () => {
    const { scheduledTask } = await import("../src/jobs");

    await scheduledTask("rss", () => Promise.resolve())();

    expect(jobMetrics.job_run_total).toBe(1);
    expect(jobMetrics.job_failure_total).toBe(0);
    expect(jobMetrics.last_failure_at).toBeNull();
  });

  it("keeps the most recent failure, not the first", () => {
    recordJobFailure("rss");
    recordJobFailure("ai");

    // Deliberately not asserting that the timestamp changed: two calls land in
    // the same millisecond, so that comparison was failing on identical ISO
    // strings. Which job failed last, and how many have failed, is the part an
    // operator actually reads.
    expect(jobMetrics.job_failure_total).toBe(2);
    expect(jobMetrics.last_failure_job).toBe("ai");
  });
});
