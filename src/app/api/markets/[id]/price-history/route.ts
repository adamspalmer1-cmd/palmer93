import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMarketPriceSeries } from "@/lib/services/charts.service";
import { HISTORY_RANGES, type HistoryRange } from "@/lib/services/price-history.service";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function parseRange(value: string | null): HistoryRange {
  return HISTORY_RANGES.includes(value as HistoryRange) ? (value as HistoryRange) : "7d";
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const range = parseRange(searchParams.get("range"));

  const supabase = await createClient();
  const { data: market, error } = await supabase
    .from("markets")
    .select("id, clob_token_ids")
    .eq("id", id)
    .maybeSingle();

  if (error || !market) {
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  }

  const tokenId = market.clob_token_ids?.[0];
  if (!tokenId) {
    return NextResponse.json({ points: [] });
  }

  const points = await getMarketPriceSeries(supabase, market.id, tokenId, range);

  return NextResponse.json({ points }, { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" } });
}
