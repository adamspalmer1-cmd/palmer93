import type { Database } from "@/types/database.types";
import type { GammaEvent, GammaMarket } from "./types";

type EventInsert = Database["public"]["Tables"]["events"]["Insert"];
type MarketInsert = Database["public"]["Tables"]["markets"]["Insert"];

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n : 0;
}

function toNullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n : null;
}

/** Maps the tag with the most specific slug to one of our curated category ids. */
const KNOWN_CATEGORY_SLUGS = new Set([
  "politics",
  "crypto",
  "sports",
  "economy",
  "culture",
  "science",
]);

function inferCategoryId(event: GammaEvent): string | null {
  for (const tag of event.tags ?? []) {
    const slug = tag.slug?.toLowerCase();
    if (slug && KNOWN_CATEGORY_SLUGS.has(slug)) return slug;
  }
  return null;
}

export function normalizeEvent(event: GammaEvent): EventInsert {
  const categoryId = inferCategoryId(event);
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description ?? null,
    image_url: event.image ?? null,
    category_id: categoryId,
    tags: (event.tags ?? []).map((t) => t.slug).filter((s): s is string => Boolean(s)),
    start_date: event.startDate ?? null,
    end_date: event.endDate ?? null,
    active: event.active ?? true,
    closed: event.closed ?? false,
    volume_24hr: toNumber(event.volume24hr),
    liquidity: toNumber(event.liquidity),
    raw: event as unknown as Database["public"]["Tables"]["events"]["Row"]["raw"],
    last_synced_at: new Date().toISOString(),
  };
}

export function normalizeMarket(market: GammaMarket, event: GammaEvent): MarketInsert {
  const outcomes = market.outcomes.map((name, i) => ({
    name,
    tokenId: market.clobTokenIds[i] ?? null,
    price: toNullableNumber(market.outcomePrices[i]),
  }));

  const lastPrice = toNullableNumber(market.outcomePrices[0]) ?? toNullableNumber(market.lastTradePrice);

  return {
    id: market.id,
    event_id: event.id,
    slug: market.slug,
    question: market.question,
    outcomes: outcomes as unknown as Database["public"]["Tables"]["markets"]["Row"]["outcomes"],
    clob_token_ids: market.clobTokenIds,
    category_id: inferCategoryId(event),
    volume: toNumber(market.volume),
    volume_24hr: toNumber(market.volume24hr),
    liquidity: toNumber(market.liquidity),
    best_bid: toNullableNumber(market.bestBid),
    best_ask: toNullableNumber(market.bestAsk),
    last_price: lastPrice,
    active: market.active ?? true,
    closed: market.closed ?? false,
    end_date: market.endDate ?? null,
    raw: market as unknown as Database["public"]["Tables"]["markets"]["Row"]["raw"],
    last_synced_at: new Date().toISOString(),
  };
}
