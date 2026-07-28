import type { Db } from "./types";
import { fetchActiveEvents } from "@/lib/polymarket/gamma";
import { normalizeEvent, normalizeMarket } from "@/lib/polymarket/normalize";
import * as eventsService from "./events.service";
import * as marketsService from "./markets.service";
import { refreshMarketOrderBook } from "./order-book.service";
import { startRun, finishRun, recordFailure } from "./sync-runs.service";

const DEFAULT_ORDER_BOOK_BATCH_SIZE = 25;
const DEFAULT_ARCHIVE_GRACE_DAYS = 3;

export const JOB_NAMES = {
  syncMarkets: "sync-markets",
  refreshOrderBooks: "refresh-order-books",
  archiveMarkets: "archive-markets",
} as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface SyncMarketsResult {
  eventsUpserted: number;
  marketsUpserted: number;
  marketsFailed: number;
  marketsResolved: number;
  runId: number;
}

/**
 * Fetches active events from Polymarket's Gamma API and upserts them one
 * event at a time. Processing per-event (rather than one giant bulk upsert)
 * is what gives us partial failure recovery: a single malformed event can't
 * take down the rest of the sync — its failure is logged to `sync_failures`
 * and the job continues. Wrapped in full run-lifecycle bookkeeping
 * (`ingestion_runs`: started_at/finished_at/duration/status).
 */
export async function syncMarkets(db: Db): Promise<SyncMarketsResult> {
  const startedAtMs = Date.now();
  const runId = await startRun(db, { jobName: JOB_NAMES.syncMarkets });

  try {
    const events = await fetchActiveEvents({ limit: 100, maxPages: 10 });

    let eventsUpserted = 0;
    let marketsUpserted = 0;
    let marketsFailed = 0;

    for (const event of events) {
      try {
        await eventsService.upsertEvents(db, [normalizeEvent(event)]);
        eventsUpserted++;

        const marketRows = event.markets.map((market) => normalizeMarket(market, event));
        await marketsService.upsertMarkets(db, marketRows);
        marketsUpserted += marketRows.length;
      } catch (error) {
        marketsFailed += Math.max(event.markets.length, 1);
        await recordFailure(db, {
          runId,
          jobName: JOB_NAMES.syncMarkets,
          eventId: event.id,
          stage: "upsert_event",
          error: errorMessage(error),
        });
      }
    }

    const marketsResolved = await marketsService.markResolvedMarkets(db);

    await finishRun(db, {
      runId,
      status: marketsFailed > 0 ? "partial" : "success",
      startedAtMs,
      eventsUpserted,
      marketsUpserted,
      marketsFailed,
    });

    return { eventsUpserted, marketsUpserted, marketsFailed, marketsResolved, runId };
  } catch (error) {
    await finishRun(db, { runId, status: "failed", startedAtMs, error: errorMessage(error) });
    throw error;
  }
}

export interface RefreshOrderBooksResult {
  refreshed: number;
  failed: number;
  runId: number;
}

/**
 * Refreshes best bid/ask/mid/spread (and a deduplicated price snapshot)
 * for the highest-volume active markets. One market's CLOB failure is
 * caught and logged rather than aborting the batch.
 */
export async function refreshOrderBooks(
  db: Db,
  batchSize = DEFAULT_ORDER_BOOK_BATCH_SIZE,
): Promise<RefreshOrderBooksResult> {
  const startedAtMs = Date.now();
  const runId = await startRun(db, { jobName: JOB_NAMES.refreshOrderBooks });

  try {
    const markets = await marketsService.getMarketsForOrderBookRefresh(db, batchSize);

    let refreshed = 0;
    let failed = 0;

    for (const market of markets) {
      try {
        const result = await refreshMarketOrderBook(db, market);
        if (result.updated) refreshed++;
      } catch (error) {
        failed++;
        await recordFailure(db, {
          runId,
          jobName: JOB_NAMES.refreshOrderBooks,
          marketId: market.id,
          stage: "order_book",
          error: errorMessage(error),
        });
      }
    }

    await finishRun(db, {
      runId,
      status: failed > 0 ? "partial" : "success",
      startedAtMs,
      orderBooksRefreshed: refreshed,
      marketsFailed: failed,
    });

    return { refreshed, failed, runId };
  } catch (error) {
    await finishRun(db, { runId, status: "failed", startedAtMs, error: errorMessage(error) });
    throw error;
  }
}

export interface ArchiveMarketsResult {
  archived: number;
  runId: number;
}

/** Retires long-closed markets from the active sync/order-book set. */
export async function archiveMarkets(db: Db, graceDays = DEFAULT_ARCHIVE_GRACE_DAYS): Promise<ArchiveMarketsResult> {
  const startedAtMs = Date.now();
  const runId = await startRun(db, { jobName: JOB_NAMES.archiveMarkets });

  try {
    const archived = await marketsService.archiveStaleClosedMarkets(db, graceDays);
    await finishRun(db, { runId, status: "success", startedAtMs, marketsArchived: archived });
    return { archived, runId };
  } catch (error) {
    await finishRun(db, { runId, status: "failed", startedAtMs, error: errorMessage(error) });
    throw error;
  }
}

export interface FullSyncResult {
  sync: SyncMarketsResult;
  orderBooks: RefreshOrderBooksResult;
  archive: ArchiveMarketsResult;
}

/**
 * Runs all three jobs in sequence — the full-sync entrypoint used by
 * `/api/ingest/markets` for backward compatibility and manual full syncs.
 * Each step has its own run record and failure isolation; a failure in one
 * step does not prevent the next from running.
 */
export async function runFullSync(db: Db): Promise<FullSyncResult> {
  const sync = await syncMarkets(db);

  let orderBooks: RefreshOrderBooksResult;
  try {
    orderBooks = await refreshOrderBooks(db);
  } catch (error) {
    orderBooks = { refreshed: 0, failed: 0, runId: -1 };
    void error; // already recorded via finishRun inside refreshOrderBooks
  }

  let archive: ArchiveMarketsResult;
  try {
    archive = await archiveMarkets(db);
  } catch (error) {
    archive = { archived: 0, runId: -1 };
    void error; // already recorded via finishRun inside archiveMarkets
  }

  return { sync, orderBooks, archive };
}
