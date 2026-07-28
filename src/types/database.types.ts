// Hand-authored to mirror supabase/migrations/*.sql. Regenerate with
// `supabase gen types typescript --local` once a Supabase project is linked,
// keeping this file's shape as the source of truth for column names.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string;
          label: string;
          icon: string | null;
          sort_order: number;
        };
        Insert: Partial<Database["public"]["Tables"]["categories"]["Row"]> & { id: string; label: string };
        Update: Partial<Database["public"]["Tables"]["categories"]["Row"]>;
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          slug: string;
          title: string;
          description: string | null;
          image_url: string | null;
          category_id: string | null;
          tags: string[];
          start_date: string | null;
          end_date: string | null;
          active: boolean;
          closed: boolean;
          volume_24hr: number;
          liquidity: number;
          raw: Json | null;
          last_synced_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["events"]["Row"]> & {
          id: string;
          slug: string;
          title: string;
        };
        Update: Partial<Database["public"]["Tables"]["events"]["Row"]>;
        Relationships: [];
      };
      markets: {
        Row: {
          id: string;
          event_id: string | null;
          slug: string;
          question: string;
          outcomes: Json;
          clob_token_ids: string[];
          category_id: string | null;
          volume: number;
          volume_24hr: number;
          liquidity: number;
          best_bid: number | null;
          best_ask: number | null;
          last_price: number | null;
          price_change_24h: number | null;
          active: boolean;
          closed: boolean;
          resolved_outcome: string | null;
          end_date: string | null;
          raw: Json | null;
          last_synced_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["markets"]["Row"]> & {
          id: string;
          slug: string;
          question: string;
        };
        Update: Partial<Database["public"]["Tables"]["markets"]["Row"]>;
        Relationships: [];
      };
      price_snapshots: {
        Row: {
          id: number;
          market_id: string;
          token_id: string;
          price: number;
          volume_24hr: number | null;
          captured_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["price_snapshots"]["Row"]> & {
          market_id: string;
          token_id: string;
          price: number;
        };
        Update: Partial<Database["public"]["Tables"]["price_snapshots"]["Row"]>;
        Relationships: [];
      };
      ingestion_runs: {
        Row: {
          id: number;
          started_at: string;
          finished_at: string | null;
          status: "running" | "success" | "partial" | "failed";
          events_upserted: number;
          markets_upserted: number;
          snapshots_inserted: number;
          error: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["ingestion_runs"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["ingestion_runs"]["Row"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      watchlist_items: {
        Row: {
          id: number;
          user_id: string;
          market_id: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["watchlist_items"]["Row"]> & {
          user_id: string;
          market_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["watchlist_items"]["Row"]>;
        Relationships: [];
      };
      ai_analyses: {
        Row: {
          id: number;
          market_id: string;
          input_hash: string;
          summary: string;
          signal: "undervalued" | "overvalued" | "neutral";
          confidence: number;
          reasoning: string;
          raw_response: Json | null;
          model: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["ai_analyses"]["Row"]> & {
          market_id: string;
          input_hash: string;
          summary: string;
          signal: "undervalued" | "overvalued" | "neutral";
          confidence: number;
          reasoning: string;
          model: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_analyses"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Market = Database["public"]["Tables"]["markets"]["Row"];
export type Event = Database["public"]["Tables"]["events"]["Row"];
export type Category = Database["public"]["Tables"]["categories"]["Row"];
export type PriceSnapshot = Database["public"]["Tables"]["price_snapshots"]["Row"];
export type AiAnalysis = Database["public"]["Tables"]["ai_analyses"]["Row"];
