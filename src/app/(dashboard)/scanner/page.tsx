import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listOpportunities } from "@/lib/queries/opportunities";
import { parseScannerFilters } from "@/lib/validation/scanner-filters";
import { ViewTabs } from "@/components/scanner/view-tabs";
import { ScannerFilterBar } from "@/components/scanner/scanner-filter-bar";
import { ScannerHeaderRow } from "@/components/scanner/scanner-header-row";
import { OpportunityRow } from "@/components/scanner/opportunity-row";
import { Pagination } from "@/components/markets/pagination";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Opportunity Scanner — MarketSignal" };

interface ScannerPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ScannerPage({ searchParams }: ScannerPageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rawParams = await searchParams;
  const filters = parseScannerFilters(rawParams);
  const { rows, count, pageSize } = await listOpportunities(filters);

  const flatParams = Object.fromEntries(
    Object.entries(rawParams)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, Array.isArray(v) ? v[0]! : v!]),
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Opportunity Scanner</h1>
        <p className="text-sm text-muted">
          Claude&apos;s structured research on active markets, ranked by opportunity score. Research only — not a
          recommendation to trade.
        </p>
      </div>

      <ViewTabs activeView={filters.view} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">{count.toLocaleString()} analyses</p>
        <ScannerFilterBar />
      </div>

      <Card className="overflow-hidden p-0">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">
            No analyses match these filters yet. Run the AI Opportunity Engine or broaden your filters.
          </p>
        ) : (
          <>
            <ScannerHeaderRow />
            {rows.map((row) => (
              <OpportunityRow key={row.analysis.id} row={row} />
            ))}
          </>
        )}
        <Pagination page={filters.page} pageSize={pageSize} total={count} basePath="/scanner" searchParams={flatParams} />
      </Card>
    </div>
  );
}
