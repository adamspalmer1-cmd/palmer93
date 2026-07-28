import type { Db } from "./types";

export type DataQualityWarningType =
  | "duplicate_market"
  | "missing_price"
  | "negative_liquidity"
  | "invalid_probability"
  | "missing_category"
  | "broken_event_link"
  | "no_history"
  | "stale_data";

export interface DataQualityWarning {
  type: DataQualityWarningType;
  marketId: string | null;
  detail: string;
}

const SCAN_LIMIT = 2000;
const DEFAULT_STALE_MINUTES = 30;

/** Markets that share the same question text within the same event — usually an upstream duplicate entry. */
export async function checkDuplicateMarkets(db: Db): Promise<DataQualityWarning[]> {
  const { data, error } = await db
    .from("markets")
    .select("id, question, event_id")
    .eq("archived", false)
    .limit(SCAN_LIMIT);
  if (error) throw new Error(`Failed to check duplicate markets: ${error.message}`);

  const seen = new Map<string, string>();
  const warnings: DataQualityWarning[] = [];
  for (const row of data ?? []) {
    const key = `${row.event_id ?? "none"}::${row.question}`;
    const existingId = seen.get(key);
    if (existingId) {
      warnings.push({
        type: "duplicate_market",
        marketId: row.id,
        detail: `Duplicates question of market ${existingId} within the same event`,
      });
    } else {
      seen.set(key, row.id);
    }
  }
  return warnings;
}

export async function checkMissingPrices(db: Db): Promise<DataQualityWarning[]> {
  const { data, error } = await db
    .from("markets")
    .select("id")
    .eq("active", true)
    .eq("archived", false)
    .is("last_price", null)
    .limit(SCAN_LIMIT);
  if (error) throw new Error(`Failed to check missing prices: ${error.message}`);
  return (data ?? []).map((row) => ({ type: "missing_price" as const, marketId: row.id, detail: "No last_price recorded" }));
}

export async function checkNegativeLiquidity(db: Db): Promise<DataQualityWarning[]> {
  const { data, error } = await db.from("markets").select("id, liquidity").lt("liquidity", 0).limit(SCAN_LIMIT);
  if (error) throw new Error(`Failed to check negative liquidity: ${error.message}`);
  return (data ?? []).map((row) => ({
    type: "negative_liquidity" as const,
    marketId: row.id,
    detail: `liquidity = ${row.liquidity}`,
  }));
}

/** `last_price` represents an implied probability and must fall within [0, 1]. */
export async function checkInvalidProbabilities(db: Db): Promise<DataQualityWarning[]> {
  const [tooLow, tooHigh] = await Promise.all([
    db.from("markets").select("id, last_price").not("last_price", "is", null).lt("last_price", 0).limit(SCAN_LIMIT),
    db.from("markets").select("id, last_price").not("last_price", "is", null).gt("last_price", 1).limit(SCAN_LIMIT),
  ]);
  if (tooLow.error) throw new Error(`Failed to check invalid probabilities: ${tooLow.error.message}`);
  if (tooHigh.error) throw new Error(`Failed to check invalid probabilities: ${tooHigh.error.message}`);

  return [...(tooLow.data ?? []), ...(tooHigh.data ?? [])].map((row) => ({
    type: "invalid_probability" as const,
    marketId: row.id,
    detail: `last_price = ${row.last_price} (must be within [0, 1])`,
  }));
}

export async function checkMissingCategories(db: Db): Promise<DataQualityWarning[]> {
  const { data, error } = await db
    .from("markets")
    .select("id")
    .eq("active", true)
    .eq("archived", false)
    .is("category_id", null)
    .limit(SCAN_LIMIT);
  if (error) throw new Error(`Failed to check missing categories: ${error.message}`);
  return (data ?? []).map((row) => ({ type: "missing_category" as const, marketId: row.id, detail: "No category assigned" }));
}

/**
 * A foreign key (`markets.event_id references events`) already guarantees
 * this can't happen for rows written through normal upserts — this check
 * exists as a defensive, always-cheap sanity read, and as a canary for any
 * future migration that loosens that constraint.
 */
export async function checkBrokenEventLinks(db: Db): Promise<DataQualityWarning[]> {
  const { data: markets, error: marketsError } = await db
    .from("markets")
    .select("id, event_id")
    .not("event_id", "is", null)
    .eq("archived", false)
    .limit(SCAN_LIMIT);
  if (marketsError) throw new Error(`Failed to load markets for event-link check: ${marketsError.message}`);

  const eventIds = [...new Set((markets ?? []).map((m) => m.event_id!))];
  if (eventIds.length === 0) return [];

  const { data: events, error: eventsError } = await db.from("events").select("id").in("id", eventIds);
  if (eventsError) throw new Error(`Failed to verify event ids: ${eventsError.message}`);

  const existing = new Set((events ?? []).map((e) => e.id));
  return (markets ?? [])
    .filter((m) => !existing.has(m.event_id!))
    .map((m) => ({ type: "broken_event_link" as const, marketId: m.id, detail: `event_id ${m.event_id} does not exist` }));
}

export async function checkMarketsWithoutHistory(db: Db): Promise<DataQualityWarning[]> {
  const { data: markets, error: marketsError } = await db
    .from("markets")
    .select("id")
    .eq("active", true)
    .eq("archived", false)
    .limit(SCAN_LIMIT);
  if (marketsError) throw new Error(`Failed to load markets for history check: ${marketsError.message}`);
  if (!markets || markets.length === 0) return [];

  const { data: snapshots, error: snapshotsError } = await db
    .from("price_snapshots")
    .select("market_id")
    .in(
      "market_id",
      markets.map((m) => m.id),
    );
  if (snapshotsError) throw new Error(`Failed to load snapshots for history check: ${snapshotsError.message}`);

  const withHistory = new Set((snapshots ?? []).map((s) => s.market_id));
  return markets
    .filter((m) => !withHistory.has(m.id))
    .map((m) => ({ type: "no_history" as const, marketId: m.id, detail: "No price_snapshots rows found" }));
}

/** Pure so the staleness rule is unit-testable without a database. */
export function isStale(lastSyncedAt: string | null, cutoff: Date): boolean {
  if (!lastSyncedAt) return true;
  return new Date(lastSyncedAt).getTime() < cutoff.getTime();
}

export async function checkStaleData(db: Db, staleMinutes = DEFAULT_STALE_MINUTES): Promise<DataQualityWarning[]> {
  const cutoff = new Date(Date.now() - staleMinutes * 60 * 1000);
  const { data, error } = await db
    .from("markets")
    .select("id, last_synced_at")
    .eq("active", true)
    .eq("archived", false)
    .limit(SCAN_LIMIT);
  if (error) throw new Error(`Failed to check stale data: ${error.message}`);
  return (data ?? [])
    .filter((row) => isStale(row.last_synced_at, cutoff))
    .map((row) => ({
      type: "stale_data" as const,
      marketId: row.id,
      detail: row.last_synced_at ? `Last synced ${row.last_synced_at}` : "Never synced",
    }));
}

export interface DataQualityReport {
  warnings: DataQualityWarning[];
  countsByType: Record<DataQualityWarningType, number>;
  generatedAt: string;
}

export async function runDataQualityChecks(db: Db, staleMinutes = DEFAULT_STALE_MINUTES): Promise<DataQualityReport> {
  const results = await Promise.all([
    checkDuplicateMarkets(db),
    checkMissingPrices(db),
    checkNegativeLiquidity(db),
    checkInvalidProbabilities(db),
    checkMissingCategories(db),
    checkBrokenEventLinks(db),
    checkMarketsWithoutHistory(db),
    checkStaleData(db, staleMinutes),
  ]);

  const warnings = results.flat();
  const countsByType = warnings.reduce(
    (acc, w) => {
      acc[w.type] = (acc[w.type] ?? 0) + 1;
      return acc;
    },
    {} as Record<DataQualityWarningType, number>,
  );

  return { warnings, countsByType, generatedAt: new Date().toISOString() };
}
