import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { AuthProvider } from "@/components/auth-provider";
import { ClerkStatus } from "@/components/auth/clerk-status";
import { Logo } from "@/components/brand/logo";
import { env } from "@/lib/env";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function Page() {
  const t = await getTranslations("common");
  const tl = await getTranslations("legal");
  return (
    <AuthProvider>
      <main className="rc-weave flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
        <Logo />
        {env.clerkConfigured() ? (
          <>
            <ClerkStatus />
            <SignIn />
          </>
        ) : (
          <p className="max-w-sm text-center text-sm text-muted-foreground">
            {t("authNotConfigured")}{" "}
            {env.devAuthBypass() && <Link href="/app" className="font-semibold text-primary underline">/app</Link>}
          </p>
        )}
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
