"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { categories } from "@/config/categories";
import { RECOMMENDATION_STATUSES, RESOLUTION_RISK_LEVELS } from "@/lib/ai/analysis-schema";
import { SCANNER_SORT_OPTIONS, type ScannerSort } from "@/lib/services/opportunity-scanner.service";

const sortLabels: Record<ScannerSort, string> = {
  opportunity_score: "Opportunity score",
  confidence_score: "Confidence",
  estimated_edge_base: "Estimated edge",
  analyzed_at: "Recently analyzed",
};

export function ScannerFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={searchParams.get("category") ?? ""} onChange={(e) => update("category", e.target.value)}>
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </Select>
      <Select value={searchParams.get("status") ?? ""} onChange={(e) => update("status", e.target.value)}>
        <option value="">Any recommendation</option>
        {RECOMMENDATION_STATUSES.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </Select>
      <Select value={searchParams.get("risk") ?? ""} onChange={(e) => update("risk", e.target.value)}>
        <option value="">Any resolution risk</option>
        {RESOLUTION_RISK_LEVELS.map((level) => (
          <option key={level} value={level}>
            {level}
          </option>
        ))}
      </Select>
      <Input
        type="number"
        min={0}
        max={100}
        placeholder="Min score"
        defaultValue={searchParams.get("minScore") ?? ""}
        onBlur={(e) => update("minScore", e.target.value)}
        className="w-28"
      />
      <Select value={searchParams.get("sort") ?? "opportunity_score"} onChange={(e) => update("sort", e.target.value)}>
        {SCANNER_SORT_OPTIONS.map((sort) => (
          <option key={sort} value={sort}>
            Sort: {sortLabels[sort]}
          </option>
        ))}
      </Select>
      <Select value={searchParams.get("dir") ?? "desc"} onChange={(e) => update("dir", e.target.value)}>
        <option value="desc">Descending</option>
        <option value="asc">Ascending</option>
      </Select>
    </div>
  );
}
