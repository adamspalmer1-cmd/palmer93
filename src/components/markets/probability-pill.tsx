import { formatProbability } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function ProbabilityPill({ price }: { price: number | null }) {
  const positive = (price ?? 0) >= 0.5;
  return (
    <span
      className={cn(
        "font-numeric text-sm font-semibold tabular-nums",
        positive ? "text-positive" : "text-negative",
      )}
    >
      {formatProbability(price)}
    </span>
  );
}
