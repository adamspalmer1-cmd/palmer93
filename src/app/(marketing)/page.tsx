import type { Metadata } from "next";
import { LineChart, Sparkles, History } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getTrendingMarkets } from "@/lib/queries/markets";
import { MarketingHeader } from "@/components/layout/marketing-header";
import { MarketingFooter } from "@/components/layout/marketing-footer";
import { MarketCard } from "@/components/markets/market-card";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "MarketSignal — AI research for Polymarket",
  description: siteConfig.description,
};

const features = [
  {
    icon: LineChart,
    title: "Live market data feed",
    description:
      "Every active Polymarket market, synced continuously from Polymarket's official Gamma and CLOB APIs.",
  },
  {
    icon: Sparkles,
    title: "AI signal reasoning",
    description:
      "Claude analyzes price trends, volume, and liquidity to surface a research signal — never a trade.",
  },
  {
    icon: History,
    title: "Historical price charts",
    description:
      "Terminal-style charts of implied probability over time, so you can see how the market got here.",
  },
];

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let trending: Awaited<ReturnType<typeof getTrendingMarkets>> = [];
  try {
    trending = await getTrendingMarkets(4);
  } catch {
    trending = [];
  }

  return (
    <div className="flex min-h-screen flex-col">
      <MarketingHeader isAuthenticated={Boolean(user)} />

      <main className="flex-1">
        <section className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-6 py-24 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Find mispriced markets before the crowd does.
          </h1>
          <p className="max-w-2xl text-lg text-muted">
            AI-powered research on every Polymarket prediction market. MarketSignal is a
            research platform, not a trading bot — no orders, no wallets, no automation.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/markets" size="lg">
              Explore Markets
            </ButtonLink>
            <ButtonLink href="/sign-up" variant="secondary" size="lg">
              Get Started
            </ButtonLink>
          </div>
        </section>

        <section className="mx-auto grid max-w-5xl grid-cols-1 gap-4 px-6 pb-24 sm:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title}>
              <CardContent className="flex flex-col gap-3">
                <feature.icon className="h-6 w-6 text-accent" />
                <h3 className="text-sm font-semibold text-foreground">{feature.title}</h3>
                <p className="text-sm text-muted">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        {trending.length > 0 && (
          <section className="mx-auto max-w-6xl px-6 pb-24">
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              Trending markets right now
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {trending.map((market) => (
                <MarketCard key={market.id} market={market} />
              ))}
            </div>
          </section>
        )}
      </main>

      <MarketingFooter />
    </div>
  );
}
