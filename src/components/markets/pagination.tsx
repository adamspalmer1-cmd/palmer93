import Link from "next/link";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  searchParams: Record<string, string>;
}

export function Pagination({ page, pageSize, total, basePath, searchParams }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  function hrefFor(p: number) {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(p));
    return `${basePath}?${params.toString()}`;
  }

  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted">
      <span>
        Page {page} of {totalPages} · {total.toLocaleString()} markets
      </span>
      <div className="flex gap-2">
        <Link
          href={hrefFor(Math.max(1, page - 1))}
          aria-disabled={page <= 1}
          className={cn(
            "rounded-md border border-border px-3 py-1",
            page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-surface-hover",
          )}
        >
          Previous
        </Link>
        <Link
          href={hrefFor(Math.min(totalPages, page + 1))}
          aria-disabled={page >= totalPages}
          className={cn(
            "rounded-md border border-border px-3 py-1",
            page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-surface-hover",
          )}
        >
          Next
        </Link>
      </div>
    </div>
  );
}
