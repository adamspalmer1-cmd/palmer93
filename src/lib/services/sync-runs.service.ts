import type { Db } from "./types";
import type { IngestionRun, SyncFailure } from "@/types/database.types";

export interface StartRunInput {
  jobName: string;
}

/** Inserts the `running` row for a job invocation and returns its id. */
export async function startRun(db: Db, input: StartRunInput): Promise<number> {
  const { data, error } = await db
    .from("ingestion_runs")
    .insert({ job_name: input.jobName, status: "running", started_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to start ${input.jobName} run: ${error.message}`);
  return data.id;
}

export interface FinishRunInput {
  runId: number;
  status: "success" | "partial" | "failed";
  startedAtMs: number;
  eventsUpserted?: number;
  marketsUpserted?: number;
  snapshotsInserted?: number;
  marketsArchived?: number;
  orderBooksRefreshed?: number;
  marketsFailed?: number;
  error?: string | null;
}

export async function finishRun(db: Db, input: FinishRunInput): Promise<void> {
  const { error } = await db
    .from("ingestion_runs")
    .update({
      status: input.status,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - input.startedAtMs,
      events_upserted: input.eventsUpserted ?? 0,
      markets_upserted: input.marketsUpserted ?? 0,
      snapshots_inserted: input.snapshotsInserted ?? 0,
      markets_archived: input.marketsArchived ?? 0,
      order_books_refreshed: input.orderBooksRefreshed ?? 0,
      markets_failed: input.marketsFailed ?? 0,
      error: input.error ?? null,
    })
    .eq("id", input.runId);
  if (error) throw new Error(`Failed to finish run ${input.runId}: ${error.message}`);
}

export interface RecordFailureInput {
  runId: number | null;
  jobName: string;
  marketId?: string | null;
  eventId?: string | null;
  stage: string;
  error: string;
}

/** Records a single item's failure without aborting the batch — see docs/10-data-pipeline.md § Partial failure recovery. */
export async function recordFailure(db: Db, input: RecordFailureInput): Promise<void> {
  const { error } = await db.from("sync_failures").insert({
    run_id: input.runId,
    job_name: input.jobName,
    market_id: input.marketId ?? null,
    event_id: input.eventId ?? null,
    stage: input.stage,
    error: input.error,
  });
  if (error) throw new Error(`Failed to record sync failure: ${error.message}`);
}

export async function getRecentRuns(db: Db, limit = 20): Promise<IngestionRun[]> {
  const { data, error } = await db.from("ingestion_runs").select("*").order("started_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Failed to load recent runs: ${error.message}`);
  return data ?? [];
}

export async function getLastRunByJob(db: Db, jobName: string): Promise<IngestionRun | null> {
  const { data, error } = await db
    .from("ingestion_runs")
    .select("*")
    .eq("job_name", jobName)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load last run for ${jobName}: ${error.message}`);
  return data;
}

export async function getRecentFailures(db: Db, limit = 50): Promise<SyncFailure[]> {
  const { data, error } = await db.from("sync_failures").select("*").order("occurred_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Failed to load recent sync failures: ${error.message}`);
  return data ?? [];
}
