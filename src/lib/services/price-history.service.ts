import type { Db } from "./types";
import type { PriceSnapshot } from "@/types/database.types";

export const HISTORY_RANGES = ["1h", "6h", "24h", "7d", "30d", "all"] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];

const RANGE_MS: Record<Exclude<HistoryRange, "all">, number> = {
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

/** Pure so range math is unit-testable without a clock dependency leaking into DB tests. */
export function rangeStartDate(range: HistoryRange, now: Date = new Date()): Date | null {
  if (range === "all") return null;
  return new Date(now.getTime() - RANGE_MS[range]);
}

export async function getTotalSnapshotCount(db: Db): Promise<number> {
  const { count, error } = await db.from("price_snapshots").select("id", { count: "exact", head: true });
  if (error) throw new Error(`Failed to count price snapshots: ${error.message}`);
  return count ?? 0;
}

export async function getStoredPriceHistory(
  db: Db,
  marketId: string,
  tokenId: string,
  range: HistoryRange,
): Promise<PriceSnapshot[]> {
  let query = db
    .from("price_snapshots")
    .select("*")
    .eq("market_id", marketId)
    .eq("token_id", tokenId)
    .order("captured_at", { ascending: true });

  const start = rangeStartDate(range);
  if (start) {
    query = query.gte("captured_at", start.toISOString());
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load price history for ${marketId}/${tokenId}: ${error.message}`);
  return data ?? [];
}

export interface DedupOptions {
  /** Prices within this distance are treated as unchanged (default: half of a numeric(6,4) column's precision). */
  epsilon?: number;
  /** Always store a snapshot if this much time has passed since the last one, even if the price is unchanged. */
  maxGapMs?: number;
}

const DEFAULT_EPSILON = 0.00005;
const DEFAULT_MAX_GAP_MS = 60 * 60 * 1000; // keep at least one point per hour for continuity

/**
 * Decides whether a new price observation is worth persisting. Pure
 * function — no DB access — so the dedup rule itself is fully unit
 * testable independent of `insertSnapshotIfChanged`'s I/O.
 */
export function shouldInsertSnapshot(
  latest: { price: number; capturedAt: Date } | null,
  next: { price: number; capturedAt: Date },
  options: DedupOptions = {},
): boolean {
  if (!latest) return true;

  const epsilon = options.epsilon ?? DEFAULT_EPSILON;
  const maxGapMs = options.maxGapMs ?? DEFAULT_MAX_GAP_MS;

  const priceChanged = Math.abs(next.price - latest.price) > epsilon;
  const gapExceeded = next.capturedAt.getTime() - latest.capturedAt.getTime() >= maxGapMs;

  return priceChanged || gapExceeded;
}

export interface SnapshotInput {
  marketId: string;
  tokenId: string;
  price: number;
  volume24hr?: number | null;
  capturedAt?: Date;
}

/**
 * Inserts a price snapshot only if it represents new information (see
 * `shouldInsertSnapshot`), avoiding a row per poll for markets that simply
 * haven't moved. Returns whether a row was written.
 */
export async function insertSnapshotIfChanged(db: Db, input: SnapshotInput, options: DedupOptions = {}): Promise<boolean> {
  const capturedAt = input.capturedAt ?? new Date();

  const { data: latestRows, error: latestError } = await db
    .from("price_snapshots")
    .select("price, captured_at")
    .eq("market_id", input.marketId)
    .eq("token_id", input.tokenId)
    .order("captured_at", { ascending: false })
    .limit(1);
  if (latestError) throw new Error(`Failed to read latest snapshot: ${latestError.message}`);

  const latest = latestRows?.[0]
    ? { price: latestRows[0].price, capturedAt: new Date(latestRows[0].captured_at) }
    : null;

  if (!shouldInsertSnapshot(latest, { price: input.price, capturedAt }, options)) {
    return false;
  }

  const { error: insertError } = await db.from("price_snapshots").insert({
    market_id: input.marketId,
    token_id: input.tokenId,
    price: input.price,
    volume_24hr: input.volume24hr ?? null,
    captured_at: capturedAt.toISOString(),
  });
  if (insertError) throw new Error(`Failed to insert snapshot: ${insertError.message}`);

  return true;
}
