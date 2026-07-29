import { AlertTriangle, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RecommendationBadge, ResolutionRiskBadge } from "@/components/markets/analysis-badges";
import { RunAnalysisButton } from "@/components/markets/run-analysis-button";
import { formatProbability, formatSignedPercent, timeSince, cn } from "@/lib/utils";
import type { FullAnalysis, AnalysisHistoryPoint } from "@/lib/services/analysis-detail.service";
import type { AnalysisEvidence } from "@/types/database.types";

function StatCell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border p-2 text-center">
      <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <span className="font-numeric text-sm font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-sm text-muted">None noted.</p>;
  return (
    <ul className="flex flex-col gap-1.5 text-sm text-foreground">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-muted">•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function EvidenceList({ items }: { items: AnalysisEvidence[] }) {
  if (items.length === 0) return <p className="text-sm text-muted">None cited.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id} className="rounded-md border border-border p-2.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {item.url ? (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">
                {item.title}
              </a>
            ) : (
              <span className="font-medium text-foreground">{item.title}</span>
            )}
            <Badge tone="neutral">Tier {item.credibility_tier}</Badge>
            {item.flagged_injection && (
              <Badge tone="negative" className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Flagged content
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">
            {item.publisher ?? "Unknown publisher"}
            {item.published_at ? ` · ${new Date(item.published_at).toLocaleDateString()}` : ""}
          </p>
          {item.excerpt && <p className="mt-1 text-foreground">{item.excerpt}</p>}
        </li>
      ))}
    </ul>
  );
}

export function AnalysisPanel({
  marketId,
  fullAnalysis,
  history,
  isAuthenticated,
}: {
  marketId: string;
  fullAnalysis: FullAnalysis | null;
  history: AnalysisHistoryPoint[];
  isAuthenticated: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" /> AI Opportunity Analysis
        </CardTitle>
        <RunAnalysisButton marketId={marketId} hasAnalysis={fullAnalysis !== null} isAuthenticated={isAuthenticated} />
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!fullAnalysis && (
          <p className="text-sm text-muted">
            {isAuthenticated
              ? "No analysis yet — run one to get Claude's structured research on this market: a fair-probability range, evidence review, resolution-risk assessment, and opportunity score."
              : "Sign in to run Claude's structured research on this market."}
          </p>
        )}

        {fullAnalysis && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <RecommendationBadge status={fullAnalysis.analysis.recommendation_status} />
                <span className="text-xs text-muted">Analyzed {timeSince(fullAnalysis.analysis.analyzed_at)}</span>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wide text-muted">Opportunity score</p>
                <p className="font-numeric text-2xl font-bold text-foreground">
                  {Math.round(fullAnalysis.analysis.opportunity_score)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 rounded-md border border-border p-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted">Market price</p>
                <p className="font-numeric text-lg font-semibold text-foreground">
                  {formatProbability(fullAnalysis.analysis.market_probability)}
                </p>
              </div>
              <span className="text-muted">→</span>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted">Claude fair value</p>
                <p className="font-numeric text-lg font-semibold text-foreground">
                  {formatProbability(fullAnalysis.analysis.fair_probability_base)}
                  <span className="ml-1 text-xs font-normal text-muted">
                    ({formatProbability(fullAnalysis.analysis.fair_probability_low)}–
                    {formatProbability(fullAnalysis.analysis.fair_probability_high)})
                  </span>
                </p>
              </div>
              <div
                className={cn(
                  "ml-auto font-numeric text-sm font-semibold tabular-nums",
                  fullAnalysis.analysis.estimated_edge_base >= 0 ? "text-positive" : "text-negative",
                )}
              >
                {formatSignedPercent(fullAnalysis.analysis.estimated_edge_base)} edge
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              <StatCell label="Confidence" value={Math.round(fullAnalysis.analysis.confidence_score)} />
              <StatCell label="Evidence" value={Math.round(fullAnalysis.analysis.evidence_quality_score)} />
              <StatCell label="Liquidity" value={Math.round(fullAnalysis.analysis.liquidity_score)} />
              <StatCell label="Spread" value={Math.round(fullAnalysis.analysis.spread_score)} />
              <StatCell label="Catalyst" value={Math.round(fullAnalysis.analysis.catalyst_score)} />
              <StatCell
                label="Resolution risk"
                value={<ResolutionRiskBadge level={fullAnalysis.analysis.resolution_risk_level} />}
              />
            </div>

            <p className="text-sm text-foreground">{fullAnalysis.analysis.market_summary}</p>

            {Array.isArray(fullAnalysis.analysis.prompt_injection_flags) &&
              fullAnalysis.analysis.prompt_injection_flags.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-negative/30 bg-negative/5 p-3 text-sm text-negative">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">Suspicious embedded instructions were detected and disregarded</p>
                    <ul className="mt-1 list-disc pl-4 text-xs">
                      {(fullAnalysis.analysis.prompt_injection_flags as string[]).map((flag, i) => (
                        <li key={i}>{flag}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-positive">Bull case</h4>
                <BulletList items={(fullAnalysis.analysis.bull_case as string[]) ?? []} />
              </div>
              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-negative">Bear case</h4>
                <BulletList items={(fullAnalysis.analysis.bear_case as string[]) ?? []} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Key evidence</h4>
                <EvidenceList items={fullAnalysis.keyEvidence} />
              </div>
              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Contrary evidence</h4>
                <EvidenceList items={fullAnalysis.contraryEvidence} />
              </div>
            </div>

            {fullAnalysis.catalysts.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  Catalysts &amp; important dates
                </h4>
                <ul className="flex flex-col gap-1.5 text-sm text-foreground">
                  {fullAnalysis.catalysts.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-2">
                      <span>{c.description}</span>
                      <span className="flex items-center gap-2 text-xs text-muted">
                        {c.importance && <Badge tone="neutral">{c.importance}</Badge>}
                        {c.event_date && new Date(c.event_date).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Assumptions</h4>
                <BulletList items={fullAnalysis.assumptions.map((a) => a.assumption)} />
              </div>
              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Unknowns</h4>
                <BulletList items={fullAnalysis.unknowns.map((u) => u.description)} />
              </div>
            </div>

            <div>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Invalidation conditions</h4>
              <BulletList items={(fullAnalysis.analysis.invalidation_conditions as string[]) ?? []} />
            </div>

            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {fullAnalysis.analysis.liquidity_assessment && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Liquidity assessment</h4>
                  <p className="text-foreground">{fullAnalysis.analysis.liquidity_assessment}</p>
                </div>
              )}
              {fullAnalysis.analysis.spread_assessment && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Spread assessment</h4>
                  <p className="text-foreground">{fullAnalysis.analysis.spread_assessment}</p>
                </div>
              )}
              {fullAnalysis.analysis.resolution_assessment && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Resolution assessment</h4>
                  <p className="text-foreground">{fullAnalysis.analysis.resolution_assessment}</p>
                </div>
              )}
              {fullAnalysis.analysis.evidence_assessment && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Evidence assessment</h4>
                  <p className="text-foreground">{fullAnalysis.analysis.evidence_assessment}</p>
                </div>
              )}
            </div>

            <div className="rounded-md bg-surface-hover p-3 text-sm">
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Self-critique</h4>
              <p className="whitespace-pre-line text-foreground">{fullAnalysis.analysis.self_critique}</p>
            </div>

            {history.length > 1 && (
              <div>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Previous analyses</h4>
                <ul className="flex flex-col gap-1 text-sm">
                  {history
                    .slice()
                    .reverse()
                    .map((h) => (
                      <li key={h.analysisId} className="flex items-center justify-between border-b border-border py-1.5 last:border-0">
                        <span className="text-muted">{new Date(h.analyzedAt).toLocaleString()}</span>
                        <RecommendationBadge status={h.recommendationStatus} />
                        <span className="font-numeric tabular-nums text-foreground">
                          {formatProbability(h.fairProbabilityBase)}
                        </span>
                        <span className="font-numeric tabular-nums text-muted">score {Math.round(h.opportunityScore)}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-muted">
              Model {fullAnalysis.analysis.model_version} · Prompt {fullAnalysis.analysis.prompt_version} · Scoring{" "}
              {fullAnalysis.analysis.scoring_version} · Source data as of{" "}
              {new Date(fullAnalysis.analysis.source_data_as_of).toLocaleString()}
            </p>
          </>
        )}

        <p className="text-xs text-muted">Research only — not financial advice. MarketSignal never places trades.</p>
      </CardContent>
    </Card>
  );
}
