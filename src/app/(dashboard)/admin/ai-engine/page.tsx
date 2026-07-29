import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getAiEngineMetricsForRequest } from "@/lib/queries/ai-engine-metrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDurationMs, timeSince } from "@/lib/utils";
import type { AnalysisRun } from "@/types/database.types";

export const metadata: Metadata = { title: "AI Engine Ops — MarketSignal" };

const runStatusTone: Record<AnalysisRun["status"], "neutral" | "positive" | "negative" | "accent"> = {
  running: "neutral",
  success: "positive",
  partial: "accent",
  failed: "negative",
  budget_stopped: "negative",
};

function RunStatusBadge({ status }: { status: AnalysisRun["status"] }) {
  return <Badge tone={runStatusTone[status] ?? "neutral"}>{status.replaceAll("_", " ")}</Badge>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="font-numeric text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

export default async function AiEngineOpsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const metrics = await getAiEngineMetricsForRequest();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">AI Engine Ops</h1>
        <p className="text-sm text-muted">
          Cost, latency, and reliability metrics for the AI Opportunity Engine, over the last {metrics.recentRuns.length || 0}{" "}
          batch runs. Visible to any signed-in user — Phase 1 has no admin role system yet (see docs/07-security.md).
        </p>
      </div>

      {metrics.budget.exhausted && (
        <div className="flex items-center gap-2 rounded-md border border-negative/30 bg-negative/5 p-3 text-sm text-negative">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Today&apos;s spend ({formatUsd(metrics.todaysSpendUsd)}) has reached the daily budget cap — the batch engine will
          stop scheduling new analyses until it resets.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Budget</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Spent today" value={formatUsd(metrics.todaysSpendUsd)} />
          <Stat label="Remaining today" value={formatUsd(metrics.budget.remainingUsd)} />
          <Stat label="Avg cost / analysis" value={metrics.avgCostPerAnalysis !== null ? formatUsd(metrics.avgCostPerAnalysis) : "—"} />
          <Stat label="Cost (recent runs)" value={formatUsd(metrics.totalCostUsd)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Volume</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Stat label="Analyses completed (all-time)" value={metrics.totalAnalysesAllTime.toLocaleString()} />
          <Stat label="Analyzed (recent runs)" value={metrics.marketsAnalyzed.toLocaleString()} />
          <Stat label="Insufficient data" value={metrics.marketsInsufficientData.toLocaleString()} />
          <Stat label="Skipped" value={metrics.marketsSkipped.toLocaleString()} />
          <Stat label="Failed" value={metrics.marketsFailed.toLocaleString()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latency &amp; token usage</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Avg run duration" value={formatDurationMs(metrics.avgRunDurationMs)} />
          <Stat label="Avg duration / market" value={formatDurationMs(metrics.avgDurationPerMarketMs)} />
          <Stat label="Input tokens (recent)" value={metrics.totalInputTokens.toLocaleString()} />
          <Stat label="Output tokens (recent)" value={metrics.totalOutputTokens.toLocaleString()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Structured-output failure rate</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-numeric text-2xl font-bold text-foreground">
            {formatPercent(metrics.structuredOutputFailureRate)}
          </p>
          <p className="mt-1 text-xs text-muted">
            Share of analyses where Claude&apos;s structured output failed validation even after the bounded retry, out
            of every attempt that reached the model.
          </p>
        </CardContent>
      </Card>

      <Card className="overflow-hidden p-0">
        <CardHeader>
          <CardTitle>Markets skipped, by reason</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          {Object.entries(metrics.skipSummary).length === 0 ? (
            <p className="col-span-full text-sm text-muted">No skipped markets in recent runs.</p>
          ) : (
            Object.entries(metrics.skipSummary)
              .sort(([, a], [, b]) => b - a)
              .map(([reason, count]) => (
                <div key={reason} className="rounded-md border border-border p-3">
                  <p className="truncate text-xs text-muted" title={reason}>
                    {reason}
                  </p>
                  <p className="font-numeric text-lg font-semibold text-foreground">{count}</p>
                </div>
              ))
          )}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
        </CardHeader>
        {metrics.recentRuns.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">No batch runs yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {metrics.recentRuns.map((run) => (
              <div key={run.id} className="flex flex-wrap items-center gap-4 px-4 py-3 text-sm">
                <span className="text-muted">{timeSince(run.started_at)}</span>
                <RunStatusBadge status={run.status} />
                <span className="text-muted">
                  {run.markets_analyzed} analyzed · {run.markets_skipped} skipped · {run.markets_failed} failed
                </span>
                <span className="text-muted">{formatUsd(run.estimated_cost_usd)}</span>
                <span className="text-muted">{formatDurationMs(run.duration_ms)}</span>
                {run.resumed_from_run_id && <span className="text-xs text-muted">resumed from #{run.resumed_from_run_id}</span>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        <CardHeader>
          <CardTitle>Recent failures</CardTitle>
        </CardHeader>
        {metrics.recentFailures.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">No analysis failures recorded.</p>
        ) : (
          <div className="max-h-72 divide-y divide-border overflow-y-auto">
            {metrics.recentFailures.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-xs">
                <XCircle className="h-3.5 w-3.5 shrink-0 text-negative" />
                <span className="text-muted">{timeSince(f.occurred_at)}</span>
                <Badge tone="neutral">{f.stage}</Badge>
                <span className="text-muted">{f.market_id ?? "—"}</span>
                <span className="truncate text-foreground">{f.error}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
