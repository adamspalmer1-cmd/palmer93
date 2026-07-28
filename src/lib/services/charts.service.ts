import type { Db } from "./types";
import { fetchPriceHistory, type PriceHistoryInterval } from "@/lib/polymarket/clob";
import { getStoredPriceHistory, type HistoryRange } from "./price-history.service";

export interface ChartPoint {
  time: number;
  value: number;
}

const RANGE_TO_INTERVAL: Record<HistoryRange, PriceHistoryInterval> = {
  "1h": "1h",
  "6h": "6h",
  "24h": "1d",
  "7d": "1w",
  "30d": "1m",
  all: "max",
};

const MIN_STORED_POINTS = 3;

/**
 * Returns a chart-ready price series for a market/token over `range`.
 * Prefers our own stored snapshots (stable, not subject to Polymarket's
 * fidelity degradation for closed markets); falls back to a live CLOB
 * `/prices-history` call when we don't have enough stored points yet
 * (e.g. a market that was only just ingested).
 */
export async function getMarketPriceSeries(
  db: Db,
  marketId: string,
  tokenId: string,
  range: HistoryRange,
): Promise<ChartPoint[]> {
  const stored = await getStoredPriceHistory(db, marketId, tokenId, range);

  if (stored.length >= MIN_STORED_POINTS) {
    return stored.map((row) => ({ time: Math.floor(new Date(row.captured_at).getTime() / 1000), value: row.price }));
  }

  const live = await fetchPriceHistory({ tokenId, interval: RANGE_TO_INTERVAL[range] });
  return live.map((point) => ({ time: point.t, value: point.p }));
}
