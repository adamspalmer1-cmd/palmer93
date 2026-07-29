import { z } from "zod";
import { RECOMMENDATION_STATUSES, RESOLUTION_RISK_LEVELS } from "@/lib/ai/analysis-schema";
import { SCANNER_SORT_OPTIONS, type ScannerFilters } from "@/lib/services/opportunity-scanner.service";
import { getScannerView } from "@/config/scanner-views";

const rawScannerFiltersSchema = z.object({
  view: z.string().trim().max(50).optional().default(""),
  category: z.string().trim().max(50).optional().default(""),
  status: z.enum(RECOMMENDATION_STATUSES).optional(),
  risk: z.enum(RESOLUTION_RISK_LEVELS).optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  sort: z.enum(SCANNER_SORT_OPTIONS).optional(),
  dir: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
});

export interface ParsedScannerFilters extends ScannerFilters {
  view: string;
}

/**
 * A named `view` supplies defaults for status/risk/sort; any filter param
 * explicitly present in the URL overrides the view's default for that
 * field, so a user can start from a preset and still tweak it.
 */
export function parseScannerFilters(searchParams: Record<string, string | string[] | undefined>): ParsedScannerFilters {
  const flat = Object.fromEntries(
    Object.entries(searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  const result = rawScannerFiltersSchema.safeParse(flat);
  const parsed = result.success ? result.data : rawScannerFiltersSchema.parse({});

  const view = parsed.view ? getScannerView(parsed.view) : undefined;

  return {
    view: parsed.view,
    category: parsed.category || undefined,
    recommendationStatus: parsed.status ?? view?.filters.recommendationStatus,
    resolutionRiskLevel: parsed.risk ?? view?.filters.resolutionRiskLevel,
    minOpportunityScore: parsed.minScore ?? view?.filters.minOpportunityScore,
    sort: parsed.sort ?? view?.filters.sort ?? "opportunity_score",
    sortDir: parsed.dir ?? view?.filters.sortDir ?? "desc",
    page: parsed.page,
  };
}
