/**
 * Pure order-book math, deliberately kept out of `clob.ts` (which imports
 * `server-only`) so it can be unit tested directly without pulling in a
 * server-only guard that throws outside a Server Component/route context.
 */
export function computeMidAndSpread(
  bestBid: number | null,
  bestAsk: number | null,
): { midPrice: number | null; spread: number | null } {
  if (bestBid === null || bestAsk === null) {
    return { midPrice: null, spread: null };
  }
  return {
    midPrice: (bestBid + bestAsk) / 2,
    spread: bestAsk - bestBid,
  };
}
