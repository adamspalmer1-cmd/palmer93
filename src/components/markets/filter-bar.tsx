"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/select";
import { categories } from "@/config/categories";
import type { MarketFilters } from "@/lib/validation/market-filters";

const sortLabels: Record<MarketFilters["sort"], string> = {
  volume_24hr: "Volume (24h)",
  liquidity: "Liquidity",
  end_date: "Ending soon",
  created_at: "Newest",
};

const statusLabels: Record<MarketFilters["status"], string> = {
  active: "Active",
  closed: "Closed",
  all: "All",
};

interface FilterBarProps {
  filters: MarketFilters;
  showCategory?: boolean;
}

export function FilterBar({ filters, showCategory = true }: FilterBarProps) {
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
      {showCategory && (
        <Select value={filters.category} onChange={(e) => update("category", e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      )}
      <Select value={filters.sort} onChange={(e) => update("sort", e.target.value)}>
        {Object.entries(sortLabels).map(([value, label]) => (
          <option key={value} value={value}>
            Sort: {label}
          </option>
        ))}
      </Select>
      <Select value={filters.status} onChange={(e) => update("status", e.target.value)}>
        {Object.entries(statusLabels).map(([value, label]) => (
          <option key={value} value={value}>
            Status: {label}
          </option>
        ))}
      </Select>
    </div>
  );
}
