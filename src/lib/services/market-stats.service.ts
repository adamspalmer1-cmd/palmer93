import type { Db } from "./types";
import type { Market } from "@/types/database.types";

const VOLATILITY_SCAN_LIMIT = 100;
const MOVER_SCAN_LIMIT = 50;

export interface DailyCount {
  date: string; // YYYY-MM-DD (UTC)
  count: number;
}

/** Exported for unit testing — buckets timestamps into UTC-day counts over a trailing window. */
export function bucketByUtcDay(timestamps: string[], days: number): DailyCount[] {
  const buckets = new Map<string, number>();
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const ts of timestamps) {
    const key = new Date(ts).toISOString().slice(0, 10);
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getDailyNewMarketCounts(db: Db, days = 7): Promise<DailyCount[]> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db.from("markets").select("created_at").gte("created_at", cutoff);
  if (error) throw new Error(`Failed to load daily new market counts: ${error.message}`);
  return bucketByUtcDay((data ?? []).map((r) => r.created_at), days);
}

export async function getDailyResolvedMarketCounts(db: Db, days = 7): Promise<DailyCount[]> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db.from("markets").select("resolved_at").not("resolved_at", "is", null).gte("resolved_at", cutoff);
  if (error) throw new Error(`Failed to load daily resolved market counts: ${error.message}`);
  return bucketByUtcDay((data ?? []).map((r) => r.resolved_at!), days);
}

export interface SpreadStats {
  average: number | null;
  min: number | null;
  max: number | null;
  sampleSize: number;
}

/** Computed in JS over a bounded sample rather than a SQL aggregate — see docs/04-database-schema.md for the scaling note. */
export async function getSpreadStats(db: Db): Promise<SpreadStats> {
  const { data, error } = await db
    .from("markets")
    .select("spread")
    .eq("active", true)
    .eq("archived", false)
    .not("spread", "is", null)
    .limit(2000);
  if (error) throw new Error(`Failed to load spread stats: ${error.message}`);

  const spreads = (data ?? []).map((r) => r.spread!).filter((s) => Number.isFinite(s));
  if (spreads.length === 0) return { average: null, min: null, max: null, sampleSize: 0 };

  const sum = spreads.reduce((acc, s) => acc + s, 0);
  return {
    average: sum / spreads.length,
    min: Math.min(...spreads),
    max: Math.max(...spreads),
    sampleSize: spreads.length,
  };
}

export async function getHighestLiquidityMarket(db: Db): Promise<Market | null> {
  const { data, error } = await db
    .from("markets")
    .select("*")
    .eq("active", true)
    .eq("archived", false)
    .order("liquidity", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load highest-liquidity market: ${error.message}`);
  return data;
}

export async function getHighestVolumeMarket(db: Db): Promise<Market | null> {
  const { data, error } = await db
    .from("markets")
    .select("*")
    .eq("active", true)
    .eq("archived", false)
    .order("volume_24hr", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load highest-volume market: ${error.message}`);
  return data;
}

/** Ranks by |price_change_24h|, scanning the top gainers and top losers rather than the full table. */
export async function getLargestMovers(db: Db, limit = 10): Promise<Market[]> {
  const [gainers, losers] = await Promise.all([
    db
      .from("markets")
      .select("*")
      .eq("active", true)
      .eq("archived", false)
      .not("price_change_24h", "is", null)
      .order("price_change_24h", { ascending: false })
      .limit(MOVER_SCAN_LIMIT),
    db
      .from("markets")
      .select("*")
      .eq("active", true)
      .eq("archived", false)
      .not("price_change_24h", "is", null)
      .order("price_change_24h", { ascending: true })
      .limit(MOVER_SCAN_LIMIT),
  ]);
  if (gainers.error) throw new Error(`Failed to load top gainers: ${gainers.error.message}`);
  if (losers.error) throw new Error(`Failed to load top losers: ${losers.error.message}`);

  const seen = new Map<string, Market>();
  for (const m of [...(gainers.data ?? []), ...(losers.data ?? [])]) seen.set(m.id, m);

  return [...seen.values()]
    .sort((a, b) => Math.abs(b.price_change_24h ?? 0) - Math.abs(a.price_change_24h ?? 0))
    .slice(0, limit);
}

export interface VolatilityEntry {
  market: Market;
  stdDev: number;
  sampleSize: number;
}

/** Exported for unit testing — sample standard deviation (n-1 denominator). */
export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Ranks the most-active markets by the standard deviation of their stored
 * price snapshots over the last 24h. Scans only the top-volume markets
 * (`VOLATILITY_SCAN_LIMIT`) to keep this bounded as the market count grows.
 */
export async function getMostVolatileMarkets(db: Db, limit = 10): Promise<VolatilityEntry[]> {
  const { data: candidates, error: candidatesError } = await db
    .from("markets")
    .select("*")
    .eq("active", true)
    .eq("archived", false)
    .order("volume_24hr", { ascending: false })
    .limit(VOLATILITY_SCAN_LIMIT);
  if (candidatesError) throw new Error(`Failed to load volatility candidates: ${candidatesError.message}`);
  if (!candidates || candidates.length === 0) return [];

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: snapshots, error: snapshotsError } = await db
    .from("price_snapshots")
    .select("market_id, price")
    .in(
      "market_id",
      candidates.map((m) => m.id),
    )
    .gte("captured_at", since);
  if (snapshotsError) throw new Error(`Failed to load snapshots for volatility: ${snapshotsError.message}`);

  const pricesByMarket = new Map<string, number[]>();
  for (const row of snapshots ?? []) {
    const list = pricesByMarket.get(row.market_id) ?? [];
    list.push(row.price);
    pricesByMarket.set(row.market_id, list);
  }

  const entries: VolatilityEntry[] = candidates
    .map((market) => {
      const prices = pricesByMarket.get(market.id) ?? [];
      return { market, stdDev: standardDeviation(prices), sampleSize: prices.length };
    })
    .filter((entry) => entry.sampleSize >= 2)
    .sort((a, b) => b.stdDev - a.stdDev);

  return entries.slice(0, limit);
}

export interface SyncLatencyStats {
  averageMs: number | null;
  sampleSize: number;
}

export async function getAverageSyncLatency(db: Db, jobName?: string, sampleSize = 20): Promise<SyncLatencyStats> {
  let query = db
    .from("ingestion_runs")
    .select("duration_ms")
    .not("duration_ms", "is", null)
    .order("started_at", { ascending: false })
    .limit(sampleSize);
  if (jobName) query = query.eq("job_name", jobName);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load sync latency stats: ${error.message}`);

  const durations = (data ?? []).map((r) => r.duration_ms!).filter((d): d is number => d !== null);
  if (durations.length === 0) return { averageMs: null, sampleSize: 0 };

  return {
    averageMs: durations.reduce((a, b) => a + b, 0) / durations.length,
    sampleSize: durations.length,
  };
}
