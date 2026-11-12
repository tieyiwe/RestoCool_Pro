import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthProvider } from "@/components/auth-provider";
import { Logo } from "@/components/brand/logo";
import { UserMenu } from "@/components/user-menu";
import { getSuperadmin } from "@/lib/auth/context";
import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo/site";

/** Private area: never in search results (robots.txt closes it too). */
export const metadata: Metadata = { robots: NOINDEX };

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("admin");
  const sa = await getSuperadmin();
  return (
    <AuthProvider>
      <header className="flex items-center justify-between border-b border-border bg-nuit px-4 py-2 text-creme">
        <Link href="/admin" className="flex items-center gap-2 font-bold">
          <Logo onDark />
          <span className="text-sm opacity-80">{t("badge")}</span>
        </Link>
        <UserMenu />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {sa ? children : <p role="alert" className="text-center text-muted-foreground">{t("forbidden")}</p>}
      </main>
    </AuthProvider>
  );
}
