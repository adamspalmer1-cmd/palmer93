import type { Db } from "./types";
import type { Market } from "@/types/database.types";
import { fetchOrderBookSummary } from "@/lib/polymarket/clob";
import { updateMarketOrderBook } from "./markets.service";
import { insertSnapshotIfChanged } from "./price-history.service";

export interface OrderBookRefreshResult {
  marketId: string;
  updated: boolean;
  snapshotWritten: boolean;
}

/**
 * Refreshes one market's best bid/ask/mid/spread from its primary outcome
 * token's live order book, and records a deduplicated price snapshot from
 * the resulting mid price. Throws on failure — the caller (the
 * refresh-order-books job) is responsible for catching per-market errors
 * so one bad token doesn't abort the whole batch.
 */
export async function refreshMarketOrderBook(db: Db, market: Market): Promise<OrderBookRefreshResult> {
  const tokenId = market.clob_token_ids?.[0];
  if (!tokenId) {
    return { marketId: market.id, updated: false, snapshotWritten: false };
  }

  const summary = await fetchOrderBookSummary(tokenId);
  await updateMarketOrderBook(db, market.id, summary);

  let snapshotWritten = false;
  if (summary.midPrice !== null) {
    snapshotWritten = await insertSnapshotIfChanged(db, {
      marketId: market.id,
      tokenId,
      price: summary.midPrice,
      volume24hr: market.volume_24hr,
    });
  }

  return { marketId: market.id, updated: true, snapshotWritten };
}
