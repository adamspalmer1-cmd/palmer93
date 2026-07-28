import type { Db } from "./types";
import type { IngestionRun } from "@/types/database.types";
import { JOB_NAMES } from "./sync.service";
import { getLastRunByJob } from "./sync-runs.service";

/** Mirrors the schedules configured in `vercel.json`. */
const EXPECTED_INTERVAL_MINUTES: Record<string, number> = {
  [JOB_NAMES.syncMarkets]: 5,
  [JOB_NAMES.refreshOrderBooks]: 5,
  [JOB_NAMES.archiveMarkets]: 60,
};

/** A job is considered stale if it hasn't completed within this multiple of its expected interval. */
const STALE_MULTIPLIER = 2;

export interface CronJobStatus {
  jobName: string;
  expectedIntervalMinutes: number;
  lastRun: IngestionRun | null;
  minutesSinceLastRun: number | null;
  isStale: boolean;
}

export async function getCronStatus(db: Db): Promise<CronJobStatus[]> {
  const jobNames = Object.values(JOB_NAMES);

  const runs = await Promise.all(jobNames.map((jobName) => getLastRunByJob(db, jobName)));

  return jobNames.map((jobName, i) => {
    const lastRun = runs[i];
    const expectedIntervalMinutes = EXPECTED_INTERVAL_MINUTES[jobName] ?? 60;
    const minutesSinceLastRun = lastRun
      ? (Date.now() - new Date(lastRun.started_at).getTime()) / 60_000
      : null;
    const isStale =
      minutesSinceLastRun === null || minutesSinceLastRun > expectedIntervalMinutes * STALE_MULTIPLIER;

    return { jobName, expectedIntervalMinutes, lastRun, minutesSinceLastRun, isStale };
  });
}
