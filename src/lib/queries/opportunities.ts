import "server-only";
import { createClient } from "@/lib/supabase/server";
import * as scannerService from "@/lib/services/opportunity-scanner.service";
import type { ScannerFilters } from "@/lib/services/opportunity-scanner.service";

export async function listOpportunities(filters: ScannerFilters) {
  const supabase = await createClient();
  return scannerService.listOpportunities(supabase, filters);
}
