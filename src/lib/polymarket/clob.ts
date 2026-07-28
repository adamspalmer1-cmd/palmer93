import "server-only";
import { fetchJsonWithRetry } from "./http";
import { clobPricesHistorySchema, clobOrderBookSchema, type ClobPricePoint } from "./types";
import { computeMidAndSpread } from "./order-book-math";

export { computeMidAndSpread } from "./order-book-math";

const CLOB_BASE_URL = "https://clob.polymarket.com";

export type PriceHistoryInterval = "1h" | "6h" | "1d" | "1w" | "1m" | "max" | "all";

export interface PriceHistoryOptions {
  tokenId: string;
  interval?: PriceHistoryInterval;
  fidelity?: number;
  startTs?: number;
  endTs?: number;
}

/**
 * Fetches the CLOB API's `/prices-history` timeseries for a single outcome
 * token. Public, unauthenticated read endpoint — no trading credentials
 * involved. Returns `[]` on any upstream/parse failure so a chart can
 * degrade gracefully instead of throwing.
 */
export async function fetchPriceHistory({
  tokenId,
  interval = "1w",
  fidelity,
  startTs,
  endTs,
}: PriceHistoryOptions): Promise<ClobPricePoint[]> {
  const params = new URLSearchParams({ market: tokenId, interval });
  if (fidelity) params.set("fidelity", String(fidelity));
  if (startTs) params.set("startTs", String(startTs));
  if (endTs) params.set("endTs", String(endTs));

  const url = `${CLOB_BASE_URL}/prices-history?${params.toString()}`;

  try {
    const payload = await fetchJsonWithRetry(url, { timeoutMs: 10_000, maxAttempts: 2 });
    const parsed = clobPricesHistorySchema.safeParse(payload);
    return parsed.success ? parsed.data.history : [];
  } catch {
    return [];
  }
}

export interface OrderBookSummary {
  bestBid: number | null;
  bestAsk: number | null;
  midPrice: number | null;
  spread: number | null;
}

function toNumber(value: string | number): number {
  return typeof value === "string" ? Number(value) : value;
}

/**
 * Fetches the CLOB order book for a single outcome token and reduces it to
 * the fields the market table stores. Best bid/ask are computed defensively
 * (max of bids, min of asks) rather than assuming a particular sort order
 * from the upstream response.
 */
export async function fetchOrderBookSummary(tokenId: string): Promise<OrderBookSummary> {
  const url = `${CLOB_BASE_URL}/book?token_id=${encodeURIComponent(tokenId)}`;
  const payload = await fetchJsonWithRetry(url, { timeoutMs: 10_000, maxAttempts: 3 });
  const parsed = clobOrderBookSchema.parse(payload);

  const bidPrices = parsed.bids.map((level) => toNumber(level.price)).filter(Number.isFinite);
  const askPrices = parsed.asks.map((level) => toNumber(level.price)).filter(Number.isFinite);

  const bestBid = bidPrices.length > 0 ? Math.max(...bidPrices) : null;
  const bestAsk = askPrices.length > 0 ? Math.min(...askPrices) : null;

  return {
    bestBid,
    bestAsk,
    ...computeMidAndSpread(bestBid, bestAsk),
  };
}
