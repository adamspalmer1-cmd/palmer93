import Link from "next/link";
import type { OpportunityScannerRow } from "@/lib/services/opportunity-scanner.service";
import { Badge } from "@/components/ui/badge";
import { RecommendationBadge, ResolutionRiskBadge } from "@/components/markets/analysis-badges";
import { getCategory } from "@/config/categories";
import { cn, formatCompactUsd, formatProbability, formatSignedPercent, timeSince } from "@/lib/utils";

export function OpportunityRow({ row }: { row: OpportunityScannerRow }) {
  const { analysis, market } = row;
  const category = market?.category_id ? getCategory(market.category_id) : undefined;
  const edge = analysis.fair_probability_base - analysis.market_probability;

  const content = (
    <div className="grid grid-cols-[1fr_repeat(6,auto)] items-center gap-4 border-b border-border px-4 py-3 transition-colors hover:bg-surface-hover">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{market?.question ?? analysis.market_id}</p>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted">
          {category && <Badge tone="neutral">{category.label}</Badge>}
          <span>Analyzed {timeSince(analysis.analyzed_at)}</span>
        </div>
      </div>
      <RecommendationBadge status={analysis.recommendation_status} />
      <div className="w-16 text-right font-numeric text-sm font-semibold tabular-nums text-foreground">
        {Math.round(analysis.opportunity_score)}
      </div>
      <div className="w-28 text-right">
        <div className="font-numeric text-sm tabular-nums text-foreground">
          {formatProbability(analysis.market_probability)} → {formatProbability(analysis.fair_probability_base)}
        </div>
        <div className={cn("text-xs font-numeric tabular-nums", edge >= 0 ? "text-positive" : "text-negative")}>
          {formatSignedPercent(edge)}
        </div>
      </div>
      <div className="w-16 text-right font-numeric text-sm tabular-nums text-muted">
        {Math.round(analysis.confidence_score)}
      </div>
      <ResolutionRiskBadge level={analysis.resolution_risk_level} />
      <div className="w-20 text-right font-numeric text-sm tabular-nums text-muted">
        {market ? formatCompactUsd(market.liquidity) : "—"}
      </div>
    </div>
  );

  if (!market) return content;

  return (
    <Link href={`/markets/${market.slug}`} className="block">
      {content}
    </Link>
  );
}
