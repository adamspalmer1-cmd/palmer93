import "server-only";
import { clobPricesHistorySchema, type ClobPricePoint } from "./types";

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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, { signal: controller.signal, next: { revalidate: 60 } });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const payload = await res.json();
    const parsed = clobPricesHistorySchema.safeParse(payload);
    return parsed.success ? parsed.data.history : [];
  } catch {
    return [];
  }
}
