import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2 font-numeric text-lg font-semibold">
          <span className="text-accent">▲</span> MarketSignal
        </Link>
        <div className="rounded-lg border border-border bg-surface p-6">{children}</div>
      </div>
    </div>
  );
}
