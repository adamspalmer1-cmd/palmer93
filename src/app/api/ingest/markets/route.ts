import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchActiveEvents } from "@/lib/polymarket/gamma";
import { fetchPriceHistory } from "@/lib/polymarket/clob";
import { normalizeEvent, normalizeMarket } from "@/lib/polymarket/normalize";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SNAPSHOT_TOP_N_MARKETS = 25;

function isAuthorized(request: NextRequest): boolean {
  // Vercel Cron invokes this route with `GET` and an `Authorization: Bearer
  // <CRON_SECRET>` header. We also accept the same secret via a custom
  // header so the job can be triggered manually (e.g. from `curl`) with
  // either verb during local development.
  const authHeader = request.headers.get("authorization");
  const bearerMatch = authHeader?.match(/^Bearer (.+)$/);
  const provided = bearerMatch?.[1] ?? request.headers.get("x-ingest-secret");
  return Boolean(provided) && provided === env.cronSecret();
}

async function runIngestion(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const startedAt = new Date().toISOString();
  let eventsUpserted = 0;
  let marketsUpserted = 0;
  let snapshotsInserted = 0;

  try {
    const events = await fetchActiveEvents({ limit: 100, maxPages: 10 });

    const eventRows = events.map(normalizeEvent);
    if (eventRows.length > 0) {
      const { error } = await supabase.from("events").upsert(eventRows, { onConflict: "id" });
      if (error) throw new Error(`events upsert failed: ${error.message}`);
      eventsUpserted = eventRows.length;
    }

    const marketRows = events.flatMap((event) => event.markets.map((market) => normalizeMarket(market, event)));
    if (marketRows.length > 0) {
      const { error } = await supabase.from("markets").upsert(marketRows, { onConflict: "id" });
      if (error) throw new Error(`markets upsert failed: ${error.message}`);
      marketsUpserted = marketRows.length;
    }

    const topMarkets = [...marketRows]
      .sort((a, b) => (b.volume_24hr ?? 0) - (a.volume_24hr ?? 0))
      .slice(0, SNAPSHOT_TOP_N_MARKETS);

    const snapshotRows = [];
    for (const market of topMarkets) {
      const tokenId = market.clob_token_ids?.[0];
      if (!tokenId) continue;
      const history = await fetchPriceHistory({ tokenId, interval: "1h", fidelity: 60 });
      const latest = history.at(-1);
      if (!latest) continue;
      snapshotRows.push({
        market_id: market.id!,
        token_id: tokenId,
        price: latest.p,
        volume_24hr: market.volume_24hr ?? null,
        captured_at: new Date(latest.t * 1000).toISOString(),
      });
    }

    if (snapshotRows.length > 0) {
      const { error } = await supabase.from("price_snapshots").insert(snapshotRows);
      if (error) throw new Error(`price_snapshots insert failed: ${error.message}`);
      snapshotsInserted = snapshotRows.length;
    }

    await supabase.from("ingestion_runs").insert({
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: "success",
      events_upserted: eventsUpserted,
      markets_upserted: marketsUpserted,
      snapshots_inserted: snapshotsInserted,
    });

    return NextResponse.json({
      status: "success",
      eventsUpserted,
      marketsUpserted,
      snapshotsInserted,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ingestion error";

    await supabase.from("ingestion_runs").insert({
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      status: "failed",
      events_upserted: eventsUpserted,
      markets_upserted: marketsUpserted,
      snapshots_inserted: snapshotsInserted,
      error: message,
    });

    return NextResponse.json({ status: "failed", error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return runIngestion(request);
}

export async function POST(request: NextRequest) {
  return runIngestion(request);
}
