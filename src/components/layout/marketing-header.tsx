import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";

export function MarketingHeader({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center border-b border-border bg-background/80 px-6 backdrop-blur">
      <Link href="/" className="flex items-center gap-2 font-numeric text-lg font-semibold">
        <span className="text-accent">▲</span> MarketSignal
      </Link>
      <div className="ml-auto flex items-center gap-3">
        {isAuthenticated ? (
          <ButtonLink href="/dashboard" size="sm">
            Dashboard
          </ButtonLink>
        ) : (
          <>
            <ButtonLink href="/login" variant="ghost" size="sm">
              Sign in
            </ButtonLink>
            <ButtonLink href="/sign-up" size="sm">
              Get Started
            </ButtonLink>
          </>
        )}
      </div>
    </header>
  );
}
