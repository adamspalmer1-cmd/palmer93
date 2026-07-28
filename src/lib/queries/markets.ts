import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { MarketFilters } from "@/lib/validation/market-filters";
import type { Market } from "@/types/database.types";

const PAGE_SIZE = 25;

export interface MarketListResult {
  markets: Market[];
  count: number;
  pageSize: number;
}

export async function listMarkets(filters: MarketFilters): Promise<MarketListResult> {
  const supabase = await createClient();

  let query = supabase.from("markets").select("*", { count: "exact" });

  if (filters.status === "active") {
    query = query.eq("active", true).eq("closed", false);
  } else if (filters.status === "closed") {
    query = query.eq("closed", true);
  }

  if (filters.category) {
    query = query.eq("category_id", filters.category);
  }

  if (filters.q) {
    query = query.ilike("question", `%${filters.q}%`);
  }

  const ascending = filters.sort === "end_date";
  query = query.order(filters.sort, { ascending, nullsFirst: false });

  const from = (filters.page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) throw new Error(`Failed to list markets: ${error.message}`);

  return { markets: data ?? [], count: count ?? 0, pageSize: PAGE_SIZE };
}

export async function getMarketBySlug(slug: string): Promise<Market | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("markets").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(`Failed to load market ${slug}: ${error.message}`);
  return data;
}

export async function getTrendingMarkets(limit = 6): Promise<Market[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("markets")
    .select("*")
    .eq("active", true)
    .eq("closed", false)
    .order("volume_24hr", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to load trending markets: ${error.message}`);
  return data ?? [];
}

export async function getCategoryCounts(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("markets")
    .select("category_id")
    .eq("active", true)
    .eq("closed", false);
  if (error) throw new Error(`Failed to load category counts: ${error.message}`);

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    if (!row.category_id) continue;
    counts[row.category_id] = (counts[row.category_id] ?? 0) + 1;
  }
  return counts;
}
