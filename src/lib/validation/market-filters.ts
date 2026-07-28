import { z } from "zod";

export const sortOptions = ["volume_24hr", "liquidity", "end_date", "created_at"] as const;
export const statusOptions = ["active", "closed", "all"] as const;

export const marketFiltersSchema = z.object({
  q: z.string().trim().max(200).optional().default(""),
  category: z.string().trim().max(50).optional().default(""),
  sort: z.enum(sortOptions).optional().default("volume_24hr"),
  status: z.enum(statusOptions).optional().default("active"),
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
});

export type MarketFilters = z.infer<typeof marketFiltersSchema>;

export function parseMarketFilters(searchParams: Record<string, string | string[] | undefined>): MarketFilters {
  const flat = Object.fromEntries(
    Object.entries(searchParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  const result = marketFiltersSchema.safeParse(flat);
  return result.success ? result.data : marketFiltersSchema.parse({});
}
