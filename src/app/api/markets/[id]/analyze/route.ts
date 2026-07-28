import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeMarket } from "@/lib/ai/claude";

const PROMPT_VERSION = "v1";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: market, error: marketError } = await supabase
    .from("markets")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (marketError || !market) {
    return NextResponse.json({ error: "Market not found" }, { status: 404 });
  }

  const { data: snapshots } = await supabase
    .from("price_snapshots")
    .select("price, captured_at")
    .eq("market_id", id)
    .order("captured_at", { ascending: false })
    .limit(30);

  const recentPrices = (snapshots ?? [])
    .slice()
    .reverse()
    .map((s) => ({ price: s.price, capturedAt: s.captured_at }));

  const inputForHash = JSON.stringify({
    question: market.question,
    price: market.last_price,
    change: market.price_change_24h,
    volume: market.volume_24hr,
    liquidity: market.liquidity,
    endDate: market.end_date,
    recentPrices,
    promptVersion: PROMPT_VERSION,
  });
  const inputHash = createHash("sha256").update(inputForHash).digest("hex");

  const admin = createAdminClient();

  const { data: cached } = await admin
    .from("ai_analyses")
    .select("*")
    .eq("market_id", id)
    .eq("input_hash", inputHash)
    .maybeSingle();

  if (cached) {
    return NextResponse.json({ analysis: cached, cached: true });
  }

  try {
    const result = await analyzeMarket({
      question: market.question,
      category: market.category_id,
      currentPrice: market.last_price,
      priceChange24h: market.price_change_24h,
      volume24hr: market.volume_24hr,
      liquidity: market.liquidity,
      endDate: market.end_date,
      recentPrices,
    });

    const { data: saved, error: saveError } = await admin
      .from("ai_analyses")
      .insert({
        market_id: id,
        input_hash: inputHash,
        summary: result.summary,
        signal: result.signal,
        confidence: result.confidence,
        reasoning: result.reasoning,
        model: process.env.ANTHROPIC_MODEL || "claude-opus-5",
        raw_response: result,
      })
      .select()
      .single();

    if (saveError) throw new Error(saveError.message);

    return NextResponse.json({ analysis: saved, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: latest } = await supabase
    .from("ai_analyses")
    .select("*")
    .eq("market_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ analysis: latest ?? null });
}
