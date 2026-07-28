import type { Db } from "./types";
import type { MarketFilters } from "@/lib/validation/market-filters";
import type { Market, Database } from "@/types/database.types";

const PAGE_SIZE = 25;
const DEFAULT_ARCHIVE_GRACE_DAYS = 3;
const DEFAULT_ORDER_BOOK_BATCH_SIZE = 25;

export interface MarketListResult {
  markets: Market[];
  count: number;
  pageSize: number;
}

export interface MarketCounts {
  active: number;
  closed: number;
  archived: number;
}

export async function listMarkets(db: Db, filters: MarketFilters): Promise<MarketListResult> {
  let query = db.from("markets").select("*", { count: "exact" });

  if (filters.status === "active") {
    query = query.eq("active", true).eq("closed", false).eq("archived", false);
  } else if (filters.status === "closed") {
    query = query.eq("closed", true);
  }

  if (filters.category) {
    query = query.eq("category_id", filters.category);
  }

  if (filters.q) {
    query = query.ilike("question", `%${filters.q}%`);
  }

  const ascending = filters.sort === "end_date";
  query = query.order(filters.sort, { ascending, nullsFirst: false });

  const from = (filters.page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) throw new Error(`Failed to list markets: ${error.message}`);

  return { markets: data ?? [], count: count ?? 0, pageSize: PAGE_SIZE };
}

export async function getMarketBySlug(db: Db, slug: string): Promise<Market | null> {
  const { data, error } = await db.from("markets").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(`Failed to load market ${slug}: ${error.message}`);
  return data;
}

export async function getMarketById(db: Db, id: string): Promise<Market | null> {
  const { data, error } = await db.from("markets").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to load market ${id}: ${error.message}`);
  return data;
}

export async function getTrendingMarkets(db: Db, limit = 6): Promise<Market[]> {
  const { data, error } = await db
    .from("markets")
    .select("*")
    .eq("active", true)
    .eq("closed", false)
    .eq("archived", false)
    .order("volume_24hr", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load trending markets: ${error.message}`);
  return data ?? [];
}

export async function getCategoryCounts(db: Db): Promise<Record<string, number>> {
  const { data, error } = await db
    .from("markets")
    .select("category_id")
    .eq("active", true)
    .eq("closed", false)
    .eq("archived", false);
  if (error) throw new Error(`Failed to load category counts: ${error.message}`);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    if (!row.category_id) continue;
    counts[row.category_id] = (counts[row.category_id] ?? 0) + 1;
  }
  return counts;
}

export async function getMarketCounts(db: Db): Promise<MarketCounts> {
  const [active, closed, archived] = await Promise.all([
    db.from("markets").select("id", { count: "exact", head: true }).eq("active", true).eq("closed", false).eq("archived", false),
    db.from("markets").select("id", { count: "exact", head: true }).eq("closed", true).eq("archived", false),
    db.from("markets").select("id", { count: "exact", head: true }).eq("archived", true),
  ]);

  for (const result of [active, closed, archived]) {
    if (result.error) throw new Error(`Failed to count markets: ${result.error.message}`);
  }

  return {
    active: active.count ?? 0,
    closed: closed.count ?? 0,
    archived: archived.count ?? 0,
  };
}

/**
 * Upserts normalized market rows keyed on Polymarket's own id, so re-running
 * a sync is always safe. Returns the number of rows upserted.
 */
export async function upsertMarkets(
  db: Db,
  rows: Database["public"]["Tables"]["markets"]["Insert"][],
): Promise<number> {
  if (rows.length === 0) return 0;
  const { error } = await db.from("markets").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`Failed to upsert markets: ${error.message}`);
  return rows.length;
}

/**
 * Stamps `resolved_at` the first time a market's `resolved_outcome` is
 * observed. Idempotent — only touches rows where it's still unset, so it
 * never overwrites the original resolution time on a later sync.
 */
export async function markResolvedMarkets(db: Db): Promise<number> {
  const { data, error } = await db
    .from("markets")
    .update({ resolved_at: new Date().toISOString() })
    .not("resolved_outcome", "is", null)
    .is("resolved_at", null)
    .select("id");
  if (error) throw new Error(`Failed to mark resolved markets: ${error.message}`);
  return data?.length ?? 0;
}

/** Pure so the archival cutoff rule is unit-testable without a database. */
export function isPastArchiveGrace(
  market: { resolved_at: string | null; end_date: string | null },
  cutoff: Date,
): boolean {
  const referenceDate = market.resolved_at ?? market.end_date;
  if (!referenceDate) return false;
  return new Date(referenceDate).getTime() < cutoff.getTime();
}

/**
 * Retires markets that have been closed for at least `graceDays` from the
 * active sync set. Archiving is a one-way transition — once true, a market
 * is no longer touched by the sync/order-book jobs. Candidates are fetched
 * and filtered in JS (rather than a PostgREST `.or()` expression) so the
 * cutoff rule is a plain, unit-testable function.
 */
export async function archiveStaleClosedMarkets(db: Db, graceDays = DEFAULT_ARCHIVE_GRACE_DAYS): Promise<number> {
  const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);

  const { data: candidates, error: selectError } = await db
    .from("markets")
    .select("id, resolved_at, end_date")
    .eq("closed", true)
    .eq("archived", false);
  if (selectError) throw new Error(`Failed to load archive candidates: ${selectError.message}`);

  const idsToArchive = (candidates ?? []).filter((m) => isPastArchiveGrace(m, cutoff)).map((m) => m.id);
  if (idsToArchive.length === 0) return 0;

  const { error: updateError } = await db.from("markets").update({ archived: true }).in("id", idsToArchive);
  if (updateError) throw new Error(`Failed to archive stale markets: ${updateError.message}`);
  return idsToArchive.length;
}

/** Active, non-archived markets with a tradeable token, ordered by volume — the order-book refresh job's batch. */
export async function getMarketsForOrderBookRefresh(db: Db, limit = DEFAULT_ORDER_BOOK_BATCH_SIZE): Promise<Market[]> {
  const { data, error } = await db
    .from("markets")
    .select("*")
    .eq("active", true)
    .eq("closed", false)
    .eq("archived", false)
    .not("clob_token_ids", "eq", "{}")
    .order("volume_24hr", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load markets for order book refresh: ${error.message}`);
  return data ?? [];
}

export interface OrderBookUpdate {
  bestBid: number | null;
  bestAsk: number | null;
  midPrice: number | null;
  spread: number | null;
}

export async function updateMarketOrderBook(db: Db, marketId: string, update: OrderBookUpdate): Promise<void> {
  const { error } = await db
    .from("markets")
    .update({
      best_bid: update.bestBid,
      best_ask: update.bestAsk,
      mid_price: update.midPrice,
      spread: update.spread,
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", marketId);
  if (error) throw new Error(`Failed to update order book for market ${marketId}: ${error.message}`);
}
