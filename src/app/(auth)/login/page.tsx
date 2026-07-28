import Link from "next/link";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Sign in — MarketSignal" };

export default function LoginPage() {
  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold text-foreground">Sign in</h1>
      <p className="mb-6 text-sm text-muted">Welcome back to MarketSignal.</p>
      <AuthForm mode="login" />
      <p className="mt-6 text-center text-sm text-muted">
        No account?{" "}
        <Link href="/sign-up" className="font-medium text-accent">
          Sign up
        </Link>
      </p>
    </div>
  );
}
