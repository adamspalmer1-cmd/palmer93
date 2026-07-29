import type { Db } from "./types";
import type { Market } from "@/types/database.types";
import { checkCostEligibility, type CostControlsConfig } from "@/lib/ai/cost-controls";

const SCAN_BATCH_SIZE = 500;

export interface EligibilityFilters {
  category?: string;
  /** Only markets resolving within this many hours from `now` are eligible (excludes markets with no end_date). */
  maxHoursToResolution?: number;
  /** Markets resolving sooner than this many hours from `now` are excluded (too close to call reliably). */
  minHoursToResolution?: number;
  /** Only consider markets synced within this many hours (excludes stale/never-synced markets). */
  maxHoursSinceSync?: number;
  now?: Date;
}

export interface SkippedMarket {
  market: Market;
  reasons: string[];
}

export interface EligibilitySelection {
  eligible: Market[];
  skipped: SkippedMarket[];
}

function hoursBetween(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / (1000 * 60 * 60);
}

function checkFilterEligibility(market: Market, filters: EligibilityFilters, now: Date): string[] {
  const reasons: string[] = [];

  if (filters.category && market.category_id !== filters.category) {
    reasons.push(`category ${market.category_id ?? "none"} does not match requested category ${filters.category}`);
  }

  if (filters.maxHoursToResolution !== undefined || filters.minHoursToResolution !== undefined) {
    if (!market.end_date) {
      reasons.push("no end_date, cannot evaluate time-to-resolution filters");
    } else {
      const hoursToResolution = hoursBetween(new Date(market.end_date), now);
      if (filters.maxHoursToResolution !== undefined && hoursToResolution > filters.maxHoursToResolution) {
        reasons.push(`resolves in ${hoursToResolution.toFixed(1)}h, beyond the ${filters.maxHoursToResolution}h maximum`);
      }
      if (filters.minHoursToResolution !== undefined && hoursToResolution < filters.minHoursToResolution) {
        reasons.push(`resolves in ${hoursToResolution.toFixed(1)}h, sooner than the ${filters.minHoursToResolution}h minimum`);
      }
    }
  }

  if (filters.maxHoursSinceSync !== undefined) {
    if (!market.last_synced_at) {
      reasons.push("never synced");
    } else {
      const hoursSinceSync = hoursBetween(now, new Date(market.last_synced_at));
      if (hoursSinceSync > filters.maxHoursSinceSync) {
        reasons.push(`last synced ${hoursSinceSync.toFixed(1)}h ago, beyond the ${filters.maxHoursSinceSync}h maximum`);
      }
    }
  }

  return reasons;
}

/**
 * Selects markets eligible for analysis: active/open/unresolved, passing the
 * cost-controls liquidity/spread thresholds, and any additional run filters.
 * Returns both the eligible set and every excluded market with its reasons,
 * so the batch engine can report a skip summary (task #32/#36) instead of
 * silently dropping markets.
 */
export async function selectEligibleMarkets(
  db: Db,
  config: CostControlsConfig,
  filters: EligibilityFilters = {},
): Promise<EligibilitySelection> {
  const now = filters.now ?? new Date();

  const { data, error } = await db
    .from("markets")
    .select("*")
    .eq("active", true)
    .eq("closed", false)
    .eq("archived", false)
    .is("resolved_outcome", null)
    .order("liquidity", { ascending: false })
    .limit(SCAN_BATCH_SIZE);

  if (error) throw new Error(`Failed to scan markets for analysis eligibility: ${error.message}`);

  const eligible: Market[] = [];
  const skipped: SkippedMarket[] = [];

  for (const market of data ?? []) {
    const costCheck = checkCostEligibility(
      { liquidity: market.liquidity, spread: market.spread, category: market.category_id },
      config,
    );
    const filterReasons = checkFilterEligibility(market, filters, now);
    const reasons = [...costCheck.reasons, ...filterReasons];

    if (reasons.length === 0) {
      eligible.push(market);
    } else {
      skipped.push({ market, reasons });
    }
  }

  return { eligible, skipped };
}
