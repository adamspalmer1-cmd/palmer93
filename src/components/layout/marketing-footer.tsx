import Link from "next/link";
import { siteConfig } from "@/config/site";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border px-6 py-8 text-sm text-muted">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p>&copy; {new Date().getFullYear()} MarketSignal.</p>
        <div className="flex gap-4">
          <Link href="/markets" className="hover:text-foreground">
            Markets
          </Link>
          <Link href="/login" className="hover:text-foreground">
            Sign in
          </Link>
        </div>
      </div>
      <p className="mx-auto mt-4 max-w-6xl">{siteConfig.disclaimer}</p>
    </footer>
  );
}
