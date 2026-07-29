import type { Db } from "./types";
import type { LatestAnalysis, Market } from "@/types/database.types";
import type { RecommendationStatus, ResolutionRiskLevel } from "@/lib/ai/analysis-schema";

export const SCANNER_SORT_OPTIONS = ["opportunity_score", "confidence_score", "estimated_edge_base", "analyzed_at"] as const;
export type ScannerSort = (typeof SCANNER_SORT_OPTIONS)[number];

const SCAN_BATCH_SIZE = 500;
export const SCANNER_PAGE_SIZE = 25;

export interface ScannerFilters {
  category?: string;
  recommendationStatus?: RecommendationStatus;
  resolutionRiskLevel?: ResolutionRiskLevel;
  minOpportunityScore?: number;
  sort: ScannerSort;
  sortDir: "asc" | "desc";
  page: number;
}

export type ScannerMarketSummary = Pick<Market, "id" | "slug" | "question" | "category_id" | "liquidity" | "spread">;

export interface OpportunityScannerRow {
  analysis: LatestAnalysis;
  market: ScannerMarketSummary | null;
}

export interface OpportunityScannerResult {
  rows: OpportunityScannerRow[];
  count: number;
  pageSize: number;
}

/**
 * Lists the latest analysis per market (via the `latest_analyses` view),
 * joined with live market data for display. Column-level filters
 * (recommendation status, risk level, min opportunity score) are pushed to
 * the query; category filtering happens client-side after the market join
 * since the view has no category column — the same bounded-scan-then-JS-filter
 * pattern used elsewhere (see docs/05-api-integration.md § 5.7) rather than
 * a cross-table PostgREST filter that doesn't exist for this shape.
 */
export async function listOpportunities(db: Db, filters: ScannerFilters): Promise<OpportunityScannerResult> {
  let query = db.from("latest_analyses").select("*");

  if (filters.recommendationStatus) {
    query = query.eq("recommendation_status", filters.recommendationStatus);
  }
  if (filters.resolutionRiskLevel) {
    query = query.eq("resolution_risk_level", filters.resolutionRiskLevel);
  }
  if (filters.minOpportunityScore !== undefined) {
    query = query.gte("opportunity_score", filters.minOpportunityScore);
  }

  query = query.order(filters.sort, { ascending: filters.sortDir === "asc" }).limit(SCAN_BATCH_SIZE);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list opportunities: ${error.message}`);

  const analyses = (data ?? []) as LatestAnalysis[];
  const marketIds = Array.from(new Set(analyses.map((a) => a.market_id)));

  const marketById = new Map<string, ScannerMarketSummary>();
  if (marketIds.length > 0) {
    const { data: markets, error: marketsError } = await db
      .from("markets")
      .select("id, slug, question, category_id, liquidity, spread")
      .in("id", marketIds);
    if (marketsError) throw new Error(`Failed to load markets for opportunity scanner: ${marketsError.message}`);
    for (const market of markets ?? []) marketById.set(market.id, market);
  }

  let rows: OpportunityScannerRow[] = analyses.map((analysis) => ({
    analysis,
    market: marketById.get(analysis.market_id) ?? null,
  }));

  if (filters.category) {
    rows = rows.filter((row) => row.market?.category_id === filters.category);
  }

  const count = rows.length;
  const from = (filters.page - 1) * SCANNER_PAGE_SIZE;
  const paged = rows.slice(from, from + SCANNER_PAGE_SIZE);

  return { rows: paged, count, pageSize: SCANNER_PAGE_SIZE };
}
