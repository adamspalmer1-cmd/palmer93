import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCronStatus } from "@/lib/services/cron-status.service";
import { getDatabaseHealth } from "@/lib/services/database-health.service";
import { runDataQualityChecks } from "@/lib/services/data-quality.service";
import { getRecentFailures, getRecentRuns } from "@/lib/services/sync-runs.service";
import { getAverageSyncLatency } from "@/lib/services/market-stats.service";
import {
  getDailyNewMarketCounts,
  getDailyResolvedMarketCounts,
  getSpreadStats,
  getHighestLiquidityMarket,
  getHighestVolumeMarket,
  getLargestMovers,
  getMostVolatileMarkets,
} from "@/lib/services/market-stats.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCompactUsd, formatDurationMs, formatProbability, timeSince } from "@/lib/utils";

export const metadata: Metadata = { title: "Data Pipeline Health — MarketSignal" };

function StatusBadge({ status }: { status: string }) {
  const tone = status === "success" ? "positive" : status === "partial" ? "accent" : status === "failed" ? "negative" : "neutral";
  return <Badge tone={tone}>{status}</Badge>;
}

export default async function HealthDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    cronStatus,
    dbHealth,
    dataQuality,
    recentFailures,
    recentRuns,
    dailyNew,
    dailyResolved,
    spreadStats,
    highestLiquidity,
    highestVolume,
    largestMovers,
    mostVolatile,
  ] = await Promise.all([
    getCronStatus(supabase),
    getDatabaseHealth(supabase),
    runDataQualityChecks(supabase),
    getRecentFailures(supabase, 20),
    getRecentRuns(supabase, 10),
    getDailyNewMarketCounts(supabase, 7),
    getDailyResolvedMarketCounts(supabase, 7),
    getSpreadStats(supabase),
    getHighestLiquidityMarket(supabase),
    getHighestVolumeMarket(supabase),
    getLargestMovers(supabase, 5),
    getMostVolatileMarkets(supabase, 5),
  ]);

  const latencyByJob = await Promise.all(cronStatus.map((job) => getAverageSyncLatency(supabase, job.jobName, 10)));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Data Pipeline Health</h1>
        <p className="text-sm text-muted">
          Sync jobs, data quality, and database status for the Polymarket ingestion pipeline. Visible
          to any signed-in user — Phase 1 has no admin role system yet (see docs/07-security.md).
        </p>
      </div>

      {/* Cron / job status */}
      <Card className="overflow-hidden p-0">
        <CardHeader>
          <CardTitle>Cron status</CardTitle>
        </CardHeader>
        <div className="divide-y divide-border">
          {cronStatus.map((job, i) => (
            <div key={job.jobName} className="flex flex-wrap items-center gap-4 px-4 py-3 text-sm">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {job.isStale ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-negative" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-positive" />
                )}
                <span className="font-medium text-foreground">{job.jobName}</span>
                <span className="text-xs text-muted">every {job.expectedIntervalMinutes}m</span>
              </div>
              <span className="text-muted">
                Last run: {job.lastRun ? timeSince(job.lastRun.started_at) : "never"}
              </span>
              {job.lastRun && <StatusBadge status={job.lastRun.status} />}
              <span className="text-muted">Duration: {formatDurationMs(job.lastRun?.duration_ms)}</span>
              <span className="text-muted">Avg latency (10 runs): {formatDurationMs(latencyByJob[i]?.averageMs)}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Database health */}
      <Card>
        <CardHeader>
          <CardTitle>Database health</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Reachable" value={dbHealth.reachable ? "Yes" : "No"} />
          <Stat label="Query latency" value={formatDurationMs(dbHealth.queryLatencyMs)} />
          <Stat label="Markets (active/closed/archived)" value={`${dbHealth.marketCounts.active} / ${dbHealth.marketCounts.closed} / ${dbHealth.marketCounts.archived}`} />
          <Stat label="Events (active/closed)" value={`${dbHealth.eventCounts.active} / ${dbHealth.eventCounts.closed}`} />
          <Stat label="Price snapshots" value={dbHealth.snapshotCount.toLocaleString()} />
        </CardContent>
      </Card>

      {/* Data quality warnings */}
      <Card className="overflow-hidden p-0">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Data quality warnings</CardTitle>
          <span className="text-xs text-muted">{dataQuality.warnings.length} total · generated {timeSince(dataQuality.generatedAt)}</span>
        </CardHeader>
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          {Object.entries(dataQuality.countsByType).length === 0 ? (
            <p className="col-span-full text-sm text-muted">No warnings detected.</p>
          ) : (
            Object.entries(dataQuality.countsByType).map(([type, count]) => (
              <div key={type} className="rounded-md border border-border p-3">
                <p className="text-xs text-muted">{type.replaceAll("_", " ")}</p>
                <p className="font-numeric text-lg font-semibold text-foreground">{count}</p>
              </div>
            ))
          )}
        </div>
        {dataQuality.warnings.length > 0 && (
          <div className="max-h-64 divide-y divide-border overflow-y-auto border-t border-border">
            {dataQuality.warnings.slice(0, 30).map((w, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2 text-xs">
                <Badge tone="neutral">{w.type.replaceAll("_", " ")}</Badge>
                <span className="text-muted">{w.marketId ?? "—"}</span>
                <span className="truncate text-foreground">{w.detail}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Error history */}
      <Card className="overflow-hidden p-0">
        <CardHeader>
          <CardTitle>Error history</CardTitle>
        </CardHeader>
        {recentFailures.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">No sync failures recorded.</p>
        ) : (
          <div className="max-h-72 divide-y divide-border overflow-y-auto">
            {recentFailures.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-xs">
                <XCircle className="h-3.5 w-3.5 shrink-0 text-negative" />
                <span className="text-muted">{timeSince(f.occurred_at)}</span>
                <Badge tone="neutral">{f.job_name}</Badge>
                <span className="text-muted">{f.stage}</span>
                <span className="text-muted">{f.market_id ?? f.event_id ?? "—"}</span>
                <span className="truncate text-foreground">{f.error}</span>
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-border px-4 py-3 text-xs text-muted">
          Recent runs: {recentRuns.map((r) => `${r.job_name}:${r.status}`).join(", ") || "none yet"}
        </div>
      </Card>

      {/* Market metrics */}
      <Card>
        <CardHeader>
          <CardTitle>Market metrics</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="New markets (7d)" value={dailyNew.reduce((a, d) => a + d.count, 0).toString()} />
            <Stat label="Resolved markets (7d)" value={dailyResolved.reduce((a, d) => a + d.count, 0).toString()} />
            <Stat
              label="Average spread"
              value={spreadStats.average !== null ? spreadStats.average.toFixed(4) : "—"}
            />
            <Stat label="Spread sample size" value={spreadStats.sampleSize.toString()} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs text-muted">Highest liquidity</p>
              <p className="text-sm text-foreground">{highestLiquidity?.question ?? "—"}</p>
              <p className="text-xs text-muted">{formatCompactUsd(highestLiquidity?.liquidity)}</p>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted">Highest 24h volume</p>
              <p className="text-sm text-foreground">{highestVolume?.question ?? "—"}</p>
              <p className="text-xs text-muted">{formatCompactUsd(highestVolume?.volume_24hr)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs text-muted">Largest movers (24h)</p>
              <ul className="flex flex-col gap-1">
                {largestMovers.map((m) => (
                  <li key={m.id} className="flex justify-between gap-2 text-sm">
                    <span className="truncate text-foreground">{m.question}</span>
                    <span className={(m.price_change_24h ?? 0) >= 0 ? "text-positive" : "text-negative"}>
                      {formatProbability(m.price_change_24h)}
                    </span>
                  </li>
                ))}
                {largestMovers.length === 0 && <li className="text-sm text-muted">No data yet.</li>}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-xs text-muted">Most volatile (24h stddev)</p>
              <ul className="flex flex-col gap-1">
                {mostVolatile.map((entry) => (
                  <li key={entry.market.id} className="flex justify-between gap-2 text-sm">
                    <span className="truncate text-foreground">{entry.market.question}</span>
                    <span className="text-muted">{entry.stdDev.toFixed(4)}</span>
                  </li>
                ))}
                {mostVolatile.length === 0 && <li className="text-sm text-muted">No data yet.</li>}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="font-numeric text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
