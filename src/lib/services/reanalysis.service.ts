import type { Db } from "./types";
import type { Analysis, Market } from "@/types/database.types";
import type { CostControlsConfig } from "@/lib/ai/cost-controls";

/** Reads the most recent analysis row for a market directly from `analyses` (equivalent to the `latest_analyses` view, scoped to one market). */
export async function getLatestAnalysis(db: Db, marketId: string): Promise<Analysis | null> {
  const { data, error } = await db
    .from("analyses")
    .select("*")
    .eq("market_id", marketId)
    .order("analyzed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to load latest analysis for market ${marketId}: ${error.message}`);
  return data;
}

export interface ReanalysisEligibility {
  eligible: boolean;
  reason: string;
  lastAnalyzedAt: string | null;
}

function currentMarketProbability(market: Market): number | null {
  return market.mid_price ?? market.last_price;
}

/**
 * Decides whether a market that may already have an analysis is eligible
 * for a new one: never analyzed -> always eligible; within the cooldown ->
 * ineligible unless the market's price has moved enough since the last
 * analysis to make the old estimate stale (reanalysisPriceMoveOverride).
 * Avoids the wasteful pattern of re-running an unchanged market every batch.
 */
export async function checkReanalysisEligibility(
  db: Db,
  market: Market,
  config: CostControlsConfig,
  now: Date = new Date(),
): Promise<ReanalysisEligibility> {
  const latest = await getLatestAnalysis(db, market.id);

  if (!latest) {
    return { eligible: true, reason: "never analyzed", lastAnalyzedAt: null };
  }

  const hoursSinceLastAnalysis = (now.getTime() - new Date(latest.analyzed_at).getTime()) / (1000 * 60 * 60);

  if (hoursSinceLastAnalysis >= config.reanalysisCooldownHours) {
    return {
      eligible: true,
      reason: `cooldown elapsed (${hoursSinceLastAnalysis.toFixed(1)}h since last analysis)`,
      lastAnalyzedAt: latest.analyzed_at,
    };
  }

  const currentProbability = currentMarketProbability(market);
  if (currentProbability !== null) {
    const move = Math.abs(currentProbability - latest.market_probability);
    if (move >= config.reanalysisPriceMoveOverride) {
      return {
        eligible: true,
        reason: `price moved ${move.toFixed(4)} since last analysis, exceeding the ${config.reanalysisPriceMoveOverride} override threshold`,
        lastAnalyzedAt: latest.analyzed_at,
      };
    }
  }

  const remainingHours = config.reanalysisCooldownHours - hoursSinceLastAnalysis;
  return {
    eligible: false,
    reason: `within reanalysis cooldown (${remainingHours.toFixed(1)}h remaining)`,
    lastAnalyzedAt: latest.analyzed_at,
  };
}
