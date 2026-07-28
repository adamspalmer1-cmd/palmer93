import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "@/lib/env";

const ANALYSIS_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

export const marketAnalysisSchema = z.object({
  summary: z.string().describe("2-3 sentence plain-language summary of the pricing question"),
  signal: z.enum(["undervalued", "overvalued", "neutral"]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().describe("The reasoning behind the signal, referencing price trend, volume, and time to resolution"),
});

export type MarketAnalysis = z.infer<typeof marketAnalysisSchema>;

export interface MarketAnalysisInput {
  question: string;
  category: string | null;
  currentPrice: number | null;
  priceChange24h: number | null;
  volume24hr: number;
  liquidity: number;
  endDate: string | null;
  recentPrices: { price: number; capturedAt: string }[];
}

function buildPrompt(input: MarketAnalysisInput): string {
  const priceHistory = input.recentPrices
    .map((p) => `${p.capturedAt}: ${(p.price * 100).toFixed(1)}%`)
    .join("\n");

  return `You are a research analyst for MarketSignal, a platform that helps users spot
potentially mispriced Polymarket prediction markets. You are NOT giving financial advice
and this analysis will NEVER be used to place trades automatically — it is shown to a
human as one input among many for their own research.

Market question: ${input.question}
Category: ${input.category ?? "uncategorized"}
Current implied probability: ${input.currentPrice !== null ? `${(input.currentPrice * 100).toFixed(1)}%` : "unknown"}
24h price change: ${input.priceChange24h !== null ? `${(input.priceChange24h * 100).toFixed(1)} points` : "unknown"}
24h volume: $${input.volume24hr.toLocaleString()}
Liquidity: $${input.liquidity.toLocaleString()}
Resolution date: ${input.endDate ?? "unknown"}

Recent price history:
${priceHistory || "No recent snapshots available."}

Based only on this data, assess whether the current price looks rich, cheap, or
reasonable relative to the observable trend, volume, and time remaining. Be measured —
say "neutral" with low confidence when the data doesn't support a strong view.`;
}

/**
 * Calls Claude to produce a structured research signal for a single market.
 * Uses `output_config.format` (structured outputs) rather than a manual
 * tool-use round trip, since we only need one shaped JSON object back.
 */
export async function analyzeMarket(input: MarketAnalysisInput): Promise<MarketAnalysis> {
  const client = new Anthropic({ apiKey: env.anthropicApiKey() });

  const message = await client.messages.parse({
    model: ANALYSIS_MODEL,
    max_tokens: 4096,
    output_config: {
      format: zodOutputFormat(marketAnalysisSchema),
    },
    messages: [{ role: "user", content: buildPrompt(input) }],
  });

  if (!message.parsed_output) {
    throw new Error("Claude response did not include a parsed structured output");
  }

  return message.parsed_output;
}
