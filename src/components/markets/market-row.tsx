import Link from "next/link";
import { ArrowUp, ArrowDown } from "lucide-react";
import type { Market } from "@/types/database.types";
import { formatCompactUsd, formatSignedPercent, timeUntil, cn } from "@/lib/utils";
import { ProbabilityPill } from "@/components/markets/probability-pill";
import { getCategory } from "@/config/categories";
import { Badge } from "@/components/ui/badge";

export function MarketRow({ market }: { market: Market }) {
  const change = market.price_change_24h ?? 0;
  const category = market.category_id ? getCategory(market.category_id) : undefined;

  return (
    <Link
      href={`/markets/${market.slug}`}
      className="flex items-center gap-4 border-b border-border px-4 py-3 transition-colors hover:bg-surface-hover"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{market.question}</p>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted">
          {category && <Badge tone="neutral">{category.label}</Badge>}
          <span>Vol {formatCompactUsd(market.volume_24hr)}</span>
          <span>·</span>
          <span>{timeUntil(market.end_date)}</span>
        </div>
      </div>
      <div className="flex w-20 flex-col items-end">
        <ProbabilityPill price={market.last_price} />
        <span
          className={cn(
            "flex items-center gap-0.5 text-xs font-numeric",
            change >= 0 ? "text-positive" : "text-negative",
          )}
        >
          {change >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {formatSignedPercent(change)}
        </span>
      </div>
    </Link>
  );
}
