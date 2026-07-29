import type { ScannerFilters } from "@/lib/services/opportunity-scanner.service";

export interface ScannerView {
  id: string;
  label: string;
  description: string;
  filters: Partial<Omit<ScannerFilters, "page">>;
}

/** Named default views for the Opportunity Scanner — quick starting points, not exclusive of manual filtering. */
export const scannerViews: ScannerView[] = [
  {
    id: "top-opportunities",
    label: "Top Opportunities",
    description: "Markets flagged as a possible edge, ranked by opportunity score.",
    filters: { recommendationStatus: "POSSIBLE EDGE", sort: "opportunity_score", sortDir: "desc" },
  },
  {
    id: "worth-watching",
    label: "Worth Watching",
    description: "Markets to keep an eye on, ranked by opportunity score.",
    filters: { recommendationStatus: "WATCH", sort: "opportunity_score", sortDir: "desc" },
  },
  {
    id: "needs-research",
    label: "Needs Research",
    description: "Markets where the thesis needs more digging before a call.",
    filters: { recommendationStatus: "RESEARCH", sort: "opportunity_score", sortDir: "desc" },
  },
  {
    id: "recently-analyzed",
    label: "Recently Analyzed",
    description: "Every analysis, most recent first.",
    filters: { sort: "analyzed_at", sortDir: "desc" },
  },
];

export function getScannerView(id: string): ScannerView | undefined {
  return scannerViews.find((v) => v.id === id);
}
