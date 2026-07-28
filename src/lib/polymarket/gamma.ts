import "server-only";
import { fetchJsonWithRetry } from "./http";
import { gammaEventsResponseSchema, type GammaEvent } from "./types";

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";

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
    const payload = await fetchJsonWithRetry(url);
    const parsed = gammaEventsResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(`Unexpected Gamma /events payload shape: ${parsed.error.message}`);
    }
    events.push(...parsed.data);
    if (parsed.data.length < limit) break;
  }

  return events;
}

/**
 * Fetches every closed event (regardless of resolution) so the archival job
 * can catch markets that dropped out of the active set.
 */
export async function fetchClosedEvents({
  limit = 100,
  maxPages = 5,
}: FetchActiveEventsOptions = {}): Promise<GammaEvent[]> {
  const events: GammaEvent[] = [];

  for (let page = 0; page < maxPages; page++) {
    const offset = page * limit;
    const url = `${GAMMA_BASE_URL}/events?closed=true&limit=${limit}&offset=${offset}&order=end_date&ascending=false`;
    const payload = await fetchJsonWithRetry(url);
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
  const payload = await fetchJsonWithRetry(url);
  const parsed = gammaEventsResponseSchema.safeParse(payload);
  if (!parsed.success || parsed.data.length === 0) return null;
  return parsed.data[0];
}
