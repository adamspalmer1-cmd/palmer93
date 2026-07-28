import Link from "next/link";
import type { Market } from "@/types/database.types";
import { formatCompactUsd, timeUntil } from "@/lib/utils";
import { ProbabilityPill } from "@/components/markets/probability-pill";
import { Card, CardContent } from "@/components/ui/card";
import { getCategory } from "@/config/categories";
import { Badge } from "@/components/ui/badge";

export function MarketCard({ market }: { market: Market }) {
  const category = market.category_id ? getCategory(market.category_id) : undefined;

  return (
    <Link href={`/markets/${market.slug}`}>
      <Card className="h-full transition-colors hover:bg-surface-hover">
        <CardContent className="flex h-full flex-col gap-3">
          <div className="flex items-center justify-between">
            {category && <Badge tone="accent">{category.label}</Badge>}
            <ProbabilityPill price={market.last_price} />
          </div>
          <p className="line-clamp-3 text-sm font-medium text-foreground">{market.question}</p>
          <div className="mt-auto flex items-center justify-between text-xs text-muted">
            <span>Vol {formatCompactUsd(market.volume_24hr)}</span>
            <span>{timeUntil(market.end_date)}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
