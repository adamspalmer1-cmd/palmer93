import type { Db } from "./types";
import type { Market } from "@/types/database.types";
import { getStoredPriceHistory, type HistoryRange } from "./price-history.service";
import type { AnalysisModelInput, PreviousAnalysisContext, RelatedMarketContext } from "@/lib/ai/analysis-model";

const DEFAULT_HISTORY_RANGE: HistoryRange = "30d";
const DEFAULT_MAX_RELATED_MARKETS = 5;
const DEFAULT_MAX_PREVIOUS_ANALYSES = 3;
const STALE_SYNC_WARNING_HOURS = 0.5;

interface MarketOutcome {
  name: string;
  tokenId: string | null;
  price: number | null;
}

/** `markets.outcomes` is stored as `{name, tokenId, price}[]`; the first entry is the outcome we analyze (conventionally "Yes"). */
export function resolvePrimaryOutcome(market: Market): MarketOutcome | null {
  const outcomes = market.outcomes;
  if (!Array.isArray(outcomes) || outcomes.length === 0) return null;
  const first = outcomes[0] as { name?: unknown; tokenId?: unknown; price?: unknown };
  if (typeof first?.name !== "string") return null;
  return {
    name: first.name,
    tokenId: typeof first.tokenId === "string" ? first.tokenId : null,
    price: typeof first.price === "number" ? first.price : null,
  };
}

function resolveMarketProbability(market: Market, outcome: MarketOutcome): number | null {
  return market.mid_price ?? market.last_price ?? outcome.price;
}

function resolveSpread(market: Market): number | null {
  if (market.spread !== null) return market.spread;
  if (market.best_bid !== null && market.best_ask !== null) return market.best_ask - market.best_bid;
  return null;
}

export function buildDataFreshnessWarnings(
  market: Market,
  priceHistoryCount: number,
  now: Date,
): string[] {
  const warnings: string[] = [];

  if (!market.last_synced_at) {
    warnings.push("Market has never been synced from Polymarket.");
  } else {
    const hoursSinceSync = (now.getTime() - new Date(market.last_synced_at).getTime()) / (1000 * 60 * 60);
    if (hoursSinceSync > STALE_SYNC_WARNING_HOURS) {
      warnings.push(`Market data last synced ${hoursSinceSync.toFixed(1)} hours ago.`);
    }
  }

  if (market.best_bid === null || market.best_ask === null) {
    warnings.push("No live order book data available (best bid/ask missing).");
  }

  if (priceHistoryCount === 0) {
    warnings.push("No historical price snapshots available for this market.");
  }

  if (market.liquidity <= 0) {
    warnings.push("Reported liquidity is zero or negative.");
  }

  return warnings;
}

async function getRelatedMarkets(db: Db, market: Market, limit: number): Promise<RelatedMarketContext[]> {
  if (!market.event_id) return [];

  const { data, error } = await db
    .from("markets")
    .select("*")
    .eq("event_id", market.event_id)
    .eq("active", true)
    .not("id", "eq", market.id)
    .order("volume_24hr", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load related markets for ${market.id}: ${error.message}`);

  return (data ?? []).map((m) => ({
    question: m.question,
    probability: m.mid_price ?? m.last_price,
  }));
}

async function getPreviousAnalyses(db: Db, marketId: string, limit: number): Promise<PreviousAnalysisContext[]> {
  const { data, error } = await db
    .from("analyses")
    .select("*")
    .eq("market_id", marketId)
    .order("analyzed_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to load previous analyses for ${marketId}: ${error.message}`);

  return (data ?? []).map((a) => ({
    analyzedAt: a.analyzed_at,
    fairProbabilityBase: a.fair_probability_base,
    recommendationStatus: a.recommendation_status,
    opportunityScore: a.opportunity_score,
  }));
}

export interface BuildAnalysisContextOptions {
  historyRange?: HistoryRange;
  maxRelatedMarkets?: number;
  maxPreviousAnalyses?: number;
  now?: Date;
}

/**
 * Assembles the full `AnalysisModelInput` for one market: pricing snapshot,
 * historical prices, related markets from the same event, prior analyses of
 * this market, and explicit data-freshness warnings. Throws if the market
 * has no usable outcome/price data — callers (the single-market pipeline,
 * task #31) should catch this and record the market as skipped rather than
 * let it reach the model with fabricated inputs.
 */
export async function buildAnalysisModelInput(
  db: Db,
  market: Market,
  options: BuildAnalysisContextOptions = {},
): Promise<AnalysisModelInput> {
  const now = options.now ?? new Date();

  const outcome = resolvePrimaryOutcome(market);
  if (!outcome) {
    throw new Error(`Market ${market.id} has no parseable outcomes to analyze`);
  }

  const marketProbability = resolveMarketProbability(market, outcome);
  if (marketProbability === null) {
    throw new Error(`Market ${market.id} has no usable price data (mid, last, or outcome price)`);
  }

  const priceHistory = outcome.tokenId
    ? await getStoredPriceHistory(db, market.id, outcome.tokenId, options.historyRange ?? DEFAULT_HISTORY_RANGE)
    : [];

  const [relatedMarkets, previousAnalyses] = await Promise.all([
    getRelatedMarkets(db, market, options.maxRelatedMarkets ?? DEFAULT_MAX_RELATED_MARKETS),
    getPreviousAnalyses(db, market.id, options.maxPreviousAnalyses ?? DEFAULT_MAX_PREVIOUS_ANALYSES),
  ]);

  return {
    market: {
      id: market.id,
      question: market.question,
      description: market.description,
      category: market.category_id,
      analyzedOutcome: outcome.name,
      endDate: market.end_date,
    },
    pricing: {
      marketProbability,
      bestBid: market.best_bid,
      bestAsk: market.best_ask,
      midPrice: market.mid_price,
      spread: resolveSpread(market),
      liquidity: market.liquidity,
      volume24hr: market.volume_24hr,
    },
    priceHistory: priceHistory.map((p) => ({ price: p.price, capturedAt: p.captured_at })),
    relatedMarkets,
    previousAnalyses,
    dataFreshnessWarnings: buildDataFreshnessWarnings(market, priceHistory.length, now),
    sourceDataAsOf: now.toISOString(),
  };
}
