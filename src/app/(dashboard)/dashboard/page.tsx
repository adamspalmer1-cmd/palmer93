import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTrendingMarkets, getCategoryCounts } from "@/lib/queries/markets";
import { MarketRow } from "@/components/markets/market-row";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { categories } from "@/config/categories";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Dashboard — MarketSignal" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [trending, categoryCounts] = await Promise.all([getTrendingMarkets(10), getCategoryCounts()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted">Highest 24h-volume markets across every category.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {categories.map((category) => (
          <Link key={category.id} href={`/categories/${category.id}`}>
            <Card className="transition-colors hover:bg-surface-hover">
              <CardContent className="flex flex-col gap-1 py-3">
                <span className="text-xs text-muted">{category.label}</span>
                <span className="font-numeric text-lg font-semibold text-foreground">
                  {categoryCounts[category.id] ?? 0}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="overflow-hidden p-0">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Trending markets</CardTitle>
          <ButtonLink href="/markets" variant="ghost" size="sm">
            View all
          </ButtonLink>
        </CardHeader>
        {trending.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">
            No market data yet. Trigger the ingestion job (`/api/ingest/markets`) to pull live
            Polymarket data into Supabase.
          </p>
        ) : (
          trending.map((market) => <MarketRow key={market.id} market={market} />)
        )}
      </Card>
    </div>
  );
}
