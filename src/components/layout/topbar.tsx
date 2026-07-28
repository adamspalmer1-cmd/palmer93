import { Suspense } from "react";
import { SearchBox } from "@/components/markets/search-box";
import { UserMenu } from "@/components/auth/user-menu";
import { ButtonLink } from "@/components/ui/button";

export function Topbar({ email }: { email: string | null }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/80 px-4 backdrop-blur">
      <Suspense fallback={<div className="h-10 w-full max-w-md" />}>
        <SearchBox />
      </Suspense>
      <div className="ml-auto flex items-center gap-3">
        {email ? (
          <UserMenu email={email} />
        ) : (
          <ButtonLink href="/login" variant="secondary" size="sm">
            Sign in
          </ButtonLink>
        )}
      </div>
    </header>
  );
}
