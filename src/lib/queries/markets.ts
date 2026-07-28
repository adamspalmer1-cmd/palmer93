import "server-only";
import { createClient } from "@/lib/supabase/server";
import * as marketsService from "@/lib/services/markets.service";
import type { MarketFilters } from "@/lib/validation/market-filters";

/**
 * Thin, request-scoped wrappers around `lib/services/markets.service.ts`
 * for use from Server Components/Route Handlers, where a cookie-bound
 * Supabase client is available. The service functions themselves take the
 * client as a parameter so they can be unit tested without a request
 * context — see `tests/unit/markets.service.test.ts`.
 */

export type MarketListResult = marketsService.MarketListResult;

export async function listMarkets(filters: MarketFilters) {
  const supabase = await createClient();
  return marketsService.listMarkets(supabase, filters);
}

export async function getMarketBySlug(slug: string) {
  const supabase = await createClient();
  return marketsService.getMarketBySlug(supabase, slug);
}

export async function getTrendingMarkets(limit = 6) {
  const supabase = await createClient();
  return marketsService.getTrendingMarkets(supabase, limit);
}

export async function getCategoryCounts() {
  const supabase = await createClient();
  return marketsService.getCategoryCounts(supabase);
}
