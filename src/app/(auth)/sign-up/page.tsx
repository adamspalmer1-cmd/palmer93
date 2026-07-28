import Link from "next/link";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = { title: "Sign up — MarketSignal" };

export default function SignUpPage() {
  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold text-foreground">Create your account</h1>
      <p className="mb-6 text-sm text-muted">Free to research. No wallet required.</p>
      <AuthForm mode="sign-up" />
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent">
          Sign in
        </Link>
      </p>
    </div>
  );
}
