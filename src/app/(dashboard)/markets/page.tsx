import type { Metadata } from "next";
import { listMarkets } from "@/lib/queries/markets";
import { parseMarketFilters } from "@/lib/validation/market-filters";
import { MarketRow } from "@/components/markets/market-row";
import { FilterBar } from "@/components/markets/filter-bar";
import { Pagination } from "@/components/markets/pagination";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Markets — MarketSignal" };

interface MarketsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MarketsPage({ searchParams }: MarketsPageProps) {
  const rawParams = await searchParams;
  const filters = parseMarketFilters(rawParams);
  const { markets, count, pageSize } = await listMarkets(filters);

  const flatParams = Object.fromEntries(
    Object.entries(rawParams)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, Array.isArray(v) ? v[0]! : v!]),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Active Markets</h1>
          <p className="text-sm text-muted">{count.toLocaleString()} markets</p>
        </div>
        <FilterBar filters={filters} />
      </div>

      <Card className="overflow-hidden p-0">
        {markets.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">
            No markets match your filters yet. Try broadening your search, or run the ingestion job
            to populate data.
          </p>
        ) : (
          markets.map((market) => <MarketRow key={market.id} market={market} />)
        )}
        <Pagination
          page={filters.page}
          pageSize={pageSize}
          total={count}
          basePath="/markets"
          searchParams={flatParams}
        />
      </Card>
    </div>
  );
}
