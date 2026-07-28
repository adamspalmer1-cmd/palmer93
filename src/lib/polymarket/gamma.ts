import "server-only";
import { gammaEventsResponseSchema, type GammaEvent } from "./types";

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";

async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
      clearTimeout(timeout);
      if (!res.ok) {
        throw new Error(`Polymarket Gamma API responded ${res.status} for ${url}`);
      }
      return res;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Gamma API request failed");
}

export interface FetchActiveEventsOptions {
  limit?: number;
  maxPages?: number;
}

/**
 * Paginates through active, non-closed events (each carrying its nested
 * markets) sorted by 24h volume, stopping after `maxPages` as a safety cap.
 */
export async function fetchActiveEvents({
  limit = 100,
  maxPages = 10,
}: FetchActiveEventsOptions = {}): Promise<GammaEvent[]> {
  const events: GammaEvent[] = [];

  for (let page = 0; page < maxPages; page++) {
    const offset = page * limit;
    const url = `${GAMMA_BASE_URL}/events?active=true&closed=false&limit=${limit}&offset=${offset}&order=volume24hr&ascending=false`;
    const res = await fetchWithRetry(url);
    const payload = await res.json();
    const parsed = gammaEventsResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(`Unexpected Gamma /events payload shape: ${parsed.error.message}`);
    }
    events.push(...parsed.data);
    if (parsed.data.length < limit) break;
  }

  return events;
}

export async function fetchEventBySlug(slug: string): Promise<GammaEvent | null> {
  const url = `${GAMMA_BASE_URL}/events?slug=${encodeURIComponent(slug)}`;
  const res = await fetchWithRetry(url);
  const payload = await res.json();
  const parsed = gammaEventsResponseSchema.safeParse(payload);
  if (!parsed.success || parsed.data.length === 0) return null;
  return parsed.data[0];
}
