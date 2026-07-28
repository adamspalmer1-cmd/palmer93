import type { Db } from "./types";
import type { Category } from "@/types/database.types";

export async function listCategories(db: Db): Promise<Category[]> {
  const { data, error } = await db.from("categories").select("*").order("sort_order", { ascending: true });
  if (error) throw new Error(`Failed to list categories: ${error.message}`);
  return data ?? [];
}

export async function getCategoryById(db: Db, id: string): Promise<Category | null> {
  const { data, error } = await db.from("categories").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Failed to load category ${id}: ${error.message}`);
  return data;
}
