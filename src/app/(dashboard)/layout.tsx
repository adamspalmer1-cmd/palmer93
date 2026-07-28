import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";

/**
 * Shell shared by both public browsing (markets, categories) and
 * account-gated screens (dashboard, watchlist). Auth is enforced per-page,
 * not here — see `dashboard/page.tsx` and `watchlist/page.tsx` — because
 * market discovery is intentionally public (see docs/06-authentication.md).
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col pb-14 md:pb-0">
        <Topbar email={user?.email ?? null} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
