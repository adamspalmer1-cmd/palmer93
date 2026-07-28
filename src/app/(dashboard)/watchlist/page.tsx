import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Watchlist — MarketSignal" };

export default async function WatchlistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-foreground">Watchlist</h1>
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
          <Star className="h-8 w-8 text-muted" />
          <p className="text-sm font-medium text-foreground">Coming in Phase 2</p>
          <p className="max-w-sm text-sm text-muted">
            Saving markets to a personal watchlist is planned for the next phase. The underlying
            data model already exists — this screen is just waiting on approval to build.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
