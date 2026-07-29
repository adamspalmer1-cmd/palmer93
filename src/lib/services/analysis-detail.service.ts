import type { Db } from "./types";
import type { Analysis, AnalysisAssumption, AnalysisCatalyst, AnalysisEvidence, AnalysisUnknown } from "@/types/database.types";
import { getLatestAnalysis } from "./reanalysis.service";

export interface FullAnalysis {
  analysis: Analysis;
  keyEvidence: AnalysisEvidence[];
  contraryEvidence: AnalysisEvidence[];
  catalysts: AnalysisCatalyst[];
  assumptions: AnalysisAssumption[];
  unknowns: AnalysisUnknown[];
}

/** Loads one analysis and all of its child rows for a full detail view (market detail page, task #35). */
export async function getFullAnalysis(db: Db, analysisId: number): Promise<FullAnalysis | null> {
  const { data: analysis, error: analysisError } = await db
    .from("analyses")
    .select("*")
    .eq("id", analysisId)
    .maybeSingle();
  if (analysisError) throw new Error(`Failed to load analysis ${analysisId}: ${analysisError.message}`);
  if (!analysis) return null;

  const [evidenceResult, catalystsResult, assumptionsResult, unknownsResult] = await Promise.all([
    db.from("analysis_evidence").select("*").eq("analysis_id", analysisId),
    db.from("analysis_catalysts").select("*").eq("analysis_id", analysisId).order("sort_order", { ascending: true }),
    db.from("analysis_assumptions").select("*").eq("analysis_id", analysisId).order("sort_order", { ascending: true }),
    db.from("analysis_unknowns").select("*").eq("analysis_id", analysisId).order("sort_order", { ascending: true }),
  ]);

  if (evidenceResult.error) throw new Error(`Failed to load evidence for analysis ${analysisId}: ${evidenceResult.error.message}`);
  if (catalystsResult.error) throw new Error(`Failed to load catalysts for analysis ${analysisId}: ${catalystsResult.error.message}`);
  if (assumptionsResult.error) throw new Error(`Failed to load assumptions for analysis ${analysisId}: ${assumptionsResult.error.message}`);
  if (unknownsResult.error) throw new Error(`Failed to load unknowns for analysis ${analysisId}: ${unknownsResult.error.message}`);

  const evidence = evidenceResult.data ?? [];

  return {
    analysis,
    keyEvidence: evidence.filter((e) => e.supports_thesis !== false),
    contraryEvidence: evidence.filter((e) => e.supports_thesis === false),
    catalysts: catalystsResult.data ?? [],
    assumptions: assumptionsResult.data ?? [],
    unknowns: unknownsResult.data ?? [],
  };
}

export async function getLatestFullAnalysis(db: Db, marketId: string): Promise<FullAnalysis | null> {
  const latest = await getLatestAnalysis(db, marketId);
  if (!latest) return null;
  return getFullAnalysis(db, latest.id);
}

export interface AnalysisHistoryPoint {
  analysisId: number;
  analyzedAt: string;
  marketProbability: number;
  fairProbabilityLow: number;
  fairProbabilityBase: number;
  fairProbabilityHigh: number;
  opportunityScore: number;
  recommendationStatus: string;
}

/** Every historical analysis for a market, oldest first — feeds both the fair-value chart overlay and the "previous analyses" list. */
export async function getAnalysisHistory(db: Db, marketId: string, limit = 50): Promise<AnalysisHistoryPoint[]> {
  const { data, error } = await db
    .from("analyses")
    .select("id, analyzed_at, market_probability, fair_probability_low, fair_probability_base, fair_probability_high, opportunity_score, recommendation_status")
    .eq("market_id", marketId)
    .order("analyzed_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Failed to load analysis history for market ${marketId}: ${error.message}`);

  return (data ?? []).map((row) => ({
    analysisId: row.id,
    analyzedAt: row.analyzed_at,
    marketProbability: row.market_probability,
    fairProbabilityLow: row.fair_probability_low,
    fairProbabilityBase: row.fair_probability_base,
    fairProbabilityHigh: row.fair_probability_high,
    opportunityScore: row.opportunity_score,
    recommendationStatus: row.recommendation_status,
  }));
}
