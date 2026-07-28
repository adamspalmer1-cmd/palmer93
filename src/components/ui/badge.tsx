import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "positive" | "negative" | "accent";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-hover text-muted",
  positive: "bg-positive/10 text-positive",
  negative: "bg-negative/10 text-negative",
  accent: "bg-accent/10 text-accent",
};

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
