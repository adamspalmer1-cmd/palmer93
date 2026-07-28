import type { Db } from "./types";
import { getMarketCounts, type MarketCounts } from "./markets.service";
import { getEventCounts } from "./events.service";
import { getTotalSnapshotCount } from "./price-history.service";

export interface DatabaseHealth {
  queryLatencyMs: number;
  reachable: boolean;
  marketCounts: MarketCounts;
  eventCounts: { active: number; closed: number };
  snapshotCount: number;
}

/**
 * A trivial round-trip query timed end-to-end, plus row counts across the
 * core tables — enough for a health dashboard to answer "is the database
 * reachable and roughly how much data does it hold" without a dedicated
 * monitoring stack.
 */
export async function getDatabaseHealth(db: Db): Promise<DatabaseHealth> {
  const startedAt = Date.now();
  const { error } = await db.from("categories").select("id").limit(1);
  const queryLatencyMs = Date.now() - startedAt;

  const [marketCounts, eventCounts, snapshotCount] = await Promise.all([
    getMarketCounts(db),
    getEventCounts(db),
    getTotalSnapshotCount(db),
  ]);

  return {
    queryLatencyMs,
    reachable: !error,
    marketCounts,
    eventCounts,
    snapshotCount,
  };
}
