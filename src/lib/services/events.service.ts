import type { Db } from "./types";
import type { Database, Event } from "@/types/database.types";

export async function upsertEvents(db: Db, rows: Database["public"]["Tables"]["events"]["Insert"][]): Promise<number> {
  if (rows.length === 0) return 0;
  const { error } = await db.from("events").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`Failed to upsert events: ${error.message}`);
  return rows.length;
}

export async function getEventBySlug(db: Db, slug: string): Promise<Event | null> {
  const { data, error } = await db.from("events").select("*").eq("slug", slug).maybeSingle();
  if (error) throw new Error(`Failed to load event ${slug}: ${error.message}`);
  return data;
}

export async function getEventCounts(db: Db): Promise<{ active: number; closed: number }> {
  const [active, closed] = await Promise.all([
    db.from("events").select("id", { count: "exact", head: true }).eq("active", true).eq("closed", false),
    db.from("events").select("id", { count: "exact", head: true }).eq("closed", true),
  ]);
  if (active.error) throw new Error(`Failed to count active events: ${active.error.message}`);
  if (closed.error) throw new Error(`Failed to count closed events: ${closed.error.message}`);
  return { active: active.count ?? 0, closed: closed.count ?? 0 };
}

/** Distinct event ids referenced by at least one market — used by the broken-link data-quality check. */
export async function getReferencedEventIds(db: Db, eventIds: string[]): Promise<Set<string>> {
  if (eventIds.length === 0) return new Set();
  const { data, error } = await db.from("events").select("id").in("id", eventIds);
  if (error) throw new Error(`Failed to verify event ids: ${error.message}`);
  return new Set((data ?? []).map((row) => row.id));
}
