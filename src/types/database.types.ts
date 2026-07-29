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
          description: string | null;
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
          archived: boolean;
          resolved_outcome: string | null;
          resolved_at: string | null;
          mid_price: number | null;
          spread: number | null;
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
          job_name: string;
          started_at: string;
          finished_at: string | null;
          status: "running" | "success" | "partial" | "failed";
          events_upserted: number;
          markets_upserted: number;
          snapshots_inserted: number;
          markets_archived: number;
          order_books_refreshed: number;
          markets_failed: number;
          duration_ms: number | null;
          error: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["ingestion_runs"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["ingestion_runs"]["Row"]>;
        Relationships: [];
      };
      sync_failures: {
        Row: {
          id: number;
          run_id: number | null;
          job_name: string;
          market_id: string | null;
          event_id: string | null;
          stage: string;
          error: string;
          occurred_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["sync_failures"]["Row"]> & {
          job_name: string;
          stage: string;
          error: string;
        };
        Update: Partial<Database["public"]["Tables"]["sync_failures"]["Row"]>;
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
      model_versions: {
        Row: {
          id: string;
          display_name: string | null;
          first_used_at: string;
          notes: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["model_versions"]["Row"]> & { id: string };
        Update: Partial<Database["public"]["Tables"]["model_versions"]["Row"]>;
        Relationships: [];
      };
      prompt_versions: {
        Row: {
          id: string;
          description: string | null;
          template: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["prompt_versions"]["Row"]> & { id: string; template: string };
        Update: Partial<Database["public"]["Tables"]["prompt_versions"]["Row"]>;
        Relationships: [];
      };
      analysis_runs: {
        Row: {
          id: number;
          started_at: string;
          finished_at: string | null;
          status: "running" | "success" | "partial" | "failed" | "budget_stopped";
          filters: Json;
          markets_selected: number;
          markets_analyzed: number;
          markets_insufficient_data: number;
          markets_skipped: number;
          markets_failed: number;
          skip_summary: Json;
          total_input_tokens: number;
          total_output_tokens: number;
          estimated_cost_usd: number;
          duration_ms: number | null;
          budget_stopped: boolean;
          resumed_from_run_id: number | null;
          error: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["analysis_runs"]["Row"]>;
        Update: Partial<Database["public"]["Tables"]["analysis_runs"]["Row"]>;
        Relationships: [];
      };
      analysis_failures: {
        Row: {
          id: number;
          run_id: number | null;
          market_id: string | null;
          stage: string;
          error: string;
          retryable: boolean;
          occurred_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["analysis_failures"]["Row"]> & { stage: string; error: string };
        Update: Partial<Database["public"]["Tables"]["analysis_failures"]["Row"]>;
        Relationships: [];
      };
      analyses: {
        Row: {
          id: number;
          market_id: string;
          run_id: number | null;
          analyzed_outcome: string;
          market_probability: number;
          fair_probability_low: number;
          fair_probability_base: number;
          fair_probability_high: number;
          estimated_edge_low: number;
          estimated_edge_base: number;
          estimated_edge_high: number;
          confidence_score: number;
          evidence_quality_score: number;
          liquidity_score: number;
          spread_score: number;
          resolution_risk_score: number;
          resolution_risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
          catalyst_score: number;
          opportunity_score: number;
          market_summary: string;
          bull_case: Json;
          bear_case: Json;
          key_evidence: Json;
          contrary_evidence: Json;
          invalidation_conditions: Json;
          liquidity_assessment: string | null;
          spread_assessment: string | null;
          resolution_assessment: string | null;
          evidence_assessment: string | null;
          self_critique: string;
          recommendation_status: "PASS" | "WATCH" | "RESEARCH" | "POSSIBLE EDGE" | "INSUFFICIENT DATA";
          prompt_injection_flags: Json;
          market_snapshot: Json;
          scoring_version: string;
          model_version: string;
          prompt_version: string;
          analyzed_at: string;
          source_data_as_of: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["analyses"]["Row"]> & {
          market_id: string;
          analyzed_outcome: string;
          market_probability: number;
          fair_probability_low: number;
          fair_probability_base: number;
          fair_probability_high: number;
          estimated_edge_low: number;
          estimated_edge_base: number;
          estimated_edge_high: number;
          confidence_score: number;
          evidence_quality_score: number;
          liquidity_score: number;
          spread_score: number;
          resolution_risk_score: number;
          resolution_risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
          catalyst_score: number;
          opportunity_score: number;
          market_summary: string;
          self_critique: string;
          recommendation_status: "PASS" | "WATCH" | "RESEARCH" | "POSSIBLE EDGE" | "INSUFFICIENT DATA";
          market_snapshot: Json;
          scoring_version: string;
          model_version: string;
          prompt_version: string;
          source_data_as_of: string;
        };
        // Update intentionally omitted from normal use — `analyses` is insert-only at the
        // application layer, and a DB trigger rejects UPDATE/DELETE outright (see migration 0007).
        Update: Partial<Database["public"]["Tables"]["analyses"]["Row"]>;
        Relationships: [];
      };
      analysis_evidence: {
        Row: {
          id: number;
          analysis_id: number;
          title: string;
          publisher: string | null;
          url: string | null;
          published_at: string | null;
          event_date: string | null;
          retrieved_at: string;
          source_type: string | null;
          credibility_tier: number;
          excerpt: string | null;
          supports_thesis: boolean | null;
          duplicate_of_id: number | null;
          flagged_injection: boolean;
          injection_notes: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["analysis_evidence"]["Row"]> & {
          analysis_id: number;
          title: string;
          credibility_tier: number;
        };
        Update: Partial<Database["public"]["Tables"]["analysis_evidence"]["Row"]>;
        Relationships: [];
      };
      analysis_scores: {
        Row: {
          id: number;
          analysis_id: number;
          factor: string;
          raw_value: number;
          weight: number;
          contribution: number;
          scoring_version: string;
        };
        Insert: Partial<Database["public"]["Tables"]["analysis_scores"]["Row"]> & {
          analysis_id: number;
          factor: string;
          raw_value: number;
          weight: number;
          contribution: number;
          scoring_version: string;
        };
        Update: Partial<Database["public"]["Tables"]["analysis_scores"]["Row"]>;
        Relationships: [];
      };
      analysis_catalysts: {
        Row: {
          id: number;
          analysis_id: number;
          kind: "catalyst" | "important_date";
          description: string;
          event_date: string | null;
          importance: "low" | "medium" | "high" | null;
          sort_order: number;
        };
        Insert: Partial<Database["public"]["Tables"]["analysis_catalysts"]["Row"]> & {
          analysis_id: number;
          kind: "catalyst" | "important_date";
          description: string;
        };
        Update: Partial<Database["public"]["Tables"]["analysis_catalysts"]["Row"]>;
        Relationships: [];
      };
      analysis_assumptions: {
        Row: {
          id: number;
          analysis_id: number;
          assumption: string;
          sort_order: number;
        };
        Insert: Partial<Database["public"]["Tables"]["analysis_assumptions"]["Row"]> & {
          analysis_id: number;
          assumption: string;
        };
        Update: Partial<Database["public"]["Tables"]["analysis_assumptions"]["Row"]>;
        Relationships: [];
      };
      analysis_unknowns: {
        Row: {
          id: number;
          analysis_id: number;
          description: string;
          sort_order: number;
        };
        Insert: Partial<Database["public"]["Tables"]["analysis_unknowns"]["Row"]> & {
          analysis_id: number;
          description: string;
        };
        Update: Partial<Database["public"]["Tables"]["analysis_unknowns"]["Row"]>;
        Relationships: [];
      };
    };
    Views: {
      latest_analyses: {
        Row: Database["public"]["Tables"]["analyses"]["Row"];
        Relationships: [];
      };
    };
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
export type IngestionRun = Database["public"]["Tables"]["ingestion_runs"]["Row"];
export type SyncFailure = Database["public"]["Tables"]["sync_failures"]["Row"];

// Phase 2: AI Opportunity Engine
export type ModelVersion = Database["public"]["Tables"]["model_versions"]["Row"];
export type PromptVersion = Database["public"]["Tables"]["prompt_versions"]["Row"];
export type AnalysisRun = Database["public"]["Tables"]["analysis_runs"]["Row"];
export type AnalysisFailure = Database["public"]["Tables"]["analysis_failures"]["Row"];
export type Analysis = Database["public"]["Tables"]["analyses"]["Row"];
export type AnalysisEvidence = Database["public"]["Tables"]["analysis_evidence"]["Row"];
export type AnalysisScore = Database["public"]["Tables"]["analysis_scores"]["Row"];
export type AnalysisCatalyst = Database["public"]["Tables"]["analysis_catalysts"]["Row"];
export type AnalysisAssumption = Database["public"]["Tables"]["analysis_assumptions"]["Row"];
export type AnalysisUnknown = Database["public"]["Tables"]["analysis_unknowns"]["Row"];
export type LatestAnalysis = Database["public"]["Views"]["latest_analyses"]["Row"];
