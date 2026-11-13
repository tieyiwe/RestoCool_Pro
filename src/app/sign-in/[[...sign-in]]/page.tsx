import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { AuthProvider } from "@/components/auth-provider";
import { ClerkStatus } from "@/components/auth/clerk-status";
import { Logo } from "@/components/brand/logo";
import { env } from "@/lib/env";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo/site";
import { ForgetOfflineData } from "@/components/offline/forget-offline-data";

/** Private area: never in search results (robots.txt closes it too). */
export const metadata: Metadata = { robots: NOINDEX };

export const dynamic = "force-dynamic";

export default async function Page() {
  const t = await getTranslations("common");
  const tl = await getTranslations("legal");
  const ta = await getTranslations("aide");
  return (
    <AuthProvider>
      <ForgetOfflineData />
      <main className="rc-weave flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
        <Link href="/" aria-label="RestoCool">
          <Logo />
        </Link>
        {env.clerkConfigured() ? (
          <>
            <ClerkStatus diag={{ ...env.clerkDiagnostics(), proxy: Boolean(env.clerkProxyUrl()) }} />
            <SignIn />
          </>
        ) : (
          <p className="max-w-sm text-center text-sm text-muted-foreground">
            {t("authNotConfigured")}{" "}
            {env.devAuthBypass() && <Link href="/app" className="font-semibold text-primary underline">/app</Link>}
          </p>
        )}
        <Link href="/aide" className="text-sm font-semibold text-primary underline" data-testid="signin-help">
          {ta("link")}
        </Link>
        <p className="flex gap-4 text-xs text-muted-foreground">
          <Link href="/privacy" className="underline">
            {tl("privacy")}
          </Link>
          <Link href="/terms" className="underline">
            {tl("terms")}
          </Link>
        </p>
      </main>
    </AuthProvider>
  );
}
