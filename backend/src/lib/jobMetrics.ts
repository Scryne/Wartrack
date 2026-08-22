/**
 * Counters for scheduled-task health, surfaced on GET /api/feed/health.
 *
 * Lives here rather than in jobs/index.ts so the health route does not have to
 * import the job scheduler: routes depending on jobs is the wrong direction,
 * and jobs/index.ts already imports routes/events for autoExtractEvents, which
 * would make it a cycle.
 *
 * A cron tick that throws is invisible without these — node-cron swallows the
 * rejection into an event nobody subscribes to — so an operator cannot
 * distinguish "no new articles because there is no news" from "no new articles
 * because every tick has failed for an hour".
 */
export interface JobMetrics {
  job_run_total: number;
  job_failure_total: number;
  last_failure_at: string | null;
  last_failure_job: string | null;
}

export const jobMetrics: JobMetrics = {
  job_run_total: 0,
  job_failure_total: 0,
  last_failure_at: null,
  last_failure_job: null
};

/** Record a failed scheduled run. Exported for the job wrapper and its tests. */
export function recordJobFailure(name: string): void {
  jobMetrics.job_failure_total += 1;
  jobMetrics.last_failure_at = new Date().toISOString();
  jobMetrics.last_failure_job = name;
}

/** Test helper: counters are module state and leak between cases otherwise. */
export function resetJobMetrics(): void {
  jobMetrics.job_run_total = 0;
  jobMetrics.job_failure_total = 0;
  jobMetrics.last_failure_at = null;
  jobMetrics.last_failure_job = null;
}
