import { z } from "zod";

/**
 * Schemas for Polymarket's public Gamma API (`gamma-api.polymarket.com`) and
 * CLOB API (`clob.polymarket.com`) payloads. Several numeric/array fields
 * come back as JSON-encoded strings (e.g. `outcomes`, `outcomePrices`,
 * `clobTokenIds`) — that's an upstream quirk of the Gamma API, not a typo
 * here. `normalize.ts` is responsible for decoding those.
 */

const jsonStringArray = z
  .string()
  .optional()
  .nullable()
  .transform((value) => {
    if (!value) return [] as string[];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [] as string[];
    }
  });

const numericTag = z.object({
  id: z.string().optional(),
  label: z.string().optional(),
  slug: z.string().optional(),
});

export const gammaMarketSchema = z.object({
  id: z.string(),
  slug: z.string(),
  question: z.string(),
  description: z.string().optional().nullable(),
  outcomes: jsonStringArray,
  outcomePrices: jsonStringArray,
  clobTokenIds: jsonStringArray,
  volume: z.union([z.string(), z.number()]).optional().nullable(),
  volume24hr: z.union([z.string(), z.number()]).optional().nullable(),
  liquidity: z.union([z.string(), z.number()]).optional().nullable(),
  bestBid: z.union([z.string(), z.number()]).optional().nullable(),
  bestAsk: z.union([z.string(), z.number()]).optional().nullable(),
  lastTradePrice: z.union([z.string(), z.number()]).optional().nullable(),
  active: z.boolean().optional(),
  closed: z.boolean().optional(),
  endDate: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  image: z.string().optional().nullable(),
});

export type GammaMarket = z.infer<typeof gammaMarketSchema>;

export const gammaEventSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().optional().nullable(),
  image: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  active: z.boolean().optional(),
  closed: z.boolean().optional(),
  volume24hr: z.union([z.string(), z.number()]).optional().nullable(),
  liquidity: z.union([z.string(), z.number()]).optional().nullable(),
  tags: z.array(numericTag).optional().default([]),
  markets: z.array(gammaMarketSchema).optional().default([]),
});

export type GammaEvent = z.infer<typeof gammaEventSchema>;

export const gammaEventsResponseSchema = z.array(gammaEventSchema);

export const clobPricePointSchema = z.object({
  t: z.number(),
  p: z.number(),
});

export const clobPricesHistorySchema = z.object({
  history: z.array(clobPricePointSchema).default([]),
});

export type ClobPricePoint = z.infer<typeof clobPricePointSchema>;
