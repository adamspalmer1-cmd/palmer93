import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchPriceHistory, type PriceHistoryInterval } from "@/lib/polymarket/clob";

const VALID_INTERVALS: PriceHistoryInterval[] = ["1h", "6h", "1d", "1w", "1m", "max", "all"];

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const intervalParam = searchParams.get("interval") ?? "1w";
  const interval = VALID_INTERVALS.includes(intervalParam as PriceHistoryInterval)
    ? (intervalParam as PriceHistoryInterval)
    : "1w";

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

  const history = await fetchPriceHistory({ tokenId, interval });
  const points = history.map((point) => ({ time: point.t, value: point.p }));

  return NextResponse.json({ points }, { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" } });
}
