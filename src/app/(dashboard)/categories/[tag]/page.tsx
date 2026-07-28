import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listMarkets } from "@/lib/queries/markets";
import { parseMarketFilters } from "@/lib/validation/market-filters";
import { getCategory } from "@/config/categories";
import { MarketRow } from "@/components/markets/market-row";
import { FilterBar } from "@/components/markets/filter-bar";
import { Pagination } from "@/components/markets/pagination";
import { Card } from "@/components/ui/card";

interface CategoryPageProps {
  params: Promise<{ tag: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { tag } = await params;
  const category = getCategory(tag);
  return { title: category ? `${category.label} — MarketSignal` : "Category — MarketSignal" };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { tag } = await params;
  const category = getCategory(tag);
  if (!category) notFound();

  const rawParams = await searchParams;
  const filters = parseMarketFilters({ ...rawParams, category: tag });
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
          <h1 className="text-lg font-semibold text-foreground">{category.label}</h1>
          <p className="text-sm text-muted">
            {category.description} · {count.toLocaleString()} active markets
          </p>
        </div>
        <FilterBar filters={filters} showCategory={false} />
      </div>

      <Card className="overflow-hidden p-0">
        {markets.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">
            No markets in this category yet — check back after the next ingestion run.
          </p>
        ) : (
          markets.map((market) => <MarketRow key={market.id} market={market} />)
        )}
        <Pagination
          page={filters.page}
          pageSize={pageSize}
          total={count}
          basePath={`/categories/${tag}`}
          searchParams={flatParams}
        />
      </Card>
    </div>
  );
}
