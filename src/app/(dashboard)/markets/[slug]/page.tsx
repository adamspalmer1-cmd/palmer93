import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUp, ArrowDown } from "lucide-react";
import { getMarketBySlug } from "@/lib/queries/markets";
import { createClient } from "@/lib/supabase/server";
import { getMarketPriceSeries } from "@/lib/services/charts.service";
import { getLatestFullAnalysis, getAnalysisHistory } from "@/lib/queries/analysis-detail";
import { formatCompactUsd, formatSignedPercent, cn } from "@/lib/utils";
import { ProbabilityPill } from "@/components/markets/probability-pill";
import { PriceChart } from "@/components/markets/price-chart";
import { AnalysisPanel } from "@/components/markets/analysis-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCategory } from "@/config/categories";
import { Badge } from "@/components/ui/badge";

interface MarketDetailPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: MarketDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const market = await getMarketBySlug(slug);
  return { title: market ? `${market.question} — MarketSignal` : "Market — MarketSignal" };
}

export default async function MarketDetailPage({ params }: MarketDetailPageProps) {
  const { slug } = await params;
  const market = await getMarketBySlug(slug);
  if (!market) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const tokenId = market.clob_token_ids?.[0];
  const [initialPoints, fullAnalysis, analysisHistory] = await Promise.all([
    tokenId ? getMarketPriceSeries(supabase, market.id, tokenId, "7d") : Promise.resolve([]),
    getLatestFullAnalysis(market.id),
    getAnalysisHistory(market.id),
  ]);

  const fairValuePoints = analysisHistory.map((h) => ({
    time: Math.floor(new Date(h.analyzedAt).getTime() / 1000),
    value: h.fairProbabilityBase,
  }));

  const category = market.category_id ? getCategory(market.category_id) : undefined;
  const change = market.price_change_24h ?? 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Link href="/markets" className="flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to markets
      </Link>

      <div>
        <div className="mb-1 flex items-center gap-2 text-sm text-muted">
          {category && <Badge tone="accent">{category.label}</Badge>}
        </div>
        <h1 className="text-xl font-semibold text-foreground">{market.question}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <span className="font-numeric text-2xl font-bold text-foreground">
            <ProbabilityPill price={market.last_price} />
          </span>
          <span
            className={cn(
              "flex items-center gap-1 text-sm font-numeric",
              change >= 0 ? "text-positive" : "text-negative",
            )}
          >
            {change >= 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            {formatSignedPercent(change)} (24h)
          </span>
          <span className="text-sm text-muted">Vol {formatCompactUsd(market.volume_24hr)}</span>
          <span className="text-sm text-muted">Liq {formatCompactUsd(market.liquidity)}</span>
        </div>
      </div>

      <Card>
        <CardContent>
          <PriceChart marketId={market.id} initialPoints={initialPoints} fairValuePoints={fairValuePoints} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Market details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">Resolution date</span>
            <span className="text-foreground">
              {market.end_date ? new Date(market.end_date).toLocaleDateString() : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Status</span>
            <span className="text-foreground">{market.closed ? "Closed" : "Active"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Outcomes</span>
            <span className="text-foreground">
              {Array.isArray(market.outcomes)
                ? (market.outcomes as { name?: string }[]).map((o) => o.name).join(" / ")
                : "—"}
            </span>
          </div>
        </CardContent>
      </Card>

      <AnalysisPanel
        marketId={market.id}
        fullAnalysis={fullAnalysis}
        history={analysisHistory}
        isAuthenticated={Boolean(user)}
      />
    </div>
  );
}
