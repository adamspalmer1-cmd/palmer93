import Link from "next/link";
import { scannerViews } from "@/config/scanner-views";
import { cn } from "@/lib/utils";

export function ViewTabs({ activeView }: { activeView: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href="/scanner"
        className={cn(
          "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
          activeView === "" ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:text-foreground",
        )}
      >
        All Analyses
      </Link>
      {scannerViews.map((view) => (
        <Link
          key={view.id}
          href={`/scanner?view=${view.id}`}
          title={view.description}
          className={cn(
            "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
            activeView === view.id
              ? "border-accent bg-accent/10 text-accent"
              : "border-border text-muted hover:text-foreground",
          )}
        >
          {view.label}
        </Link>
      ))}
    </div>
  );
}
