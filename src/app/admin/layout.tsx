import Link from "next/link";
import { adminI18n } from "@/lib/admin/i18n";
import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth-provider";
import { Logo } from "@/components/brand/logo";
import { UserMenu } from "@/components/user-menu";
import { getSuperadmin } from "@/lib/auth/context";
import { adminLangAction } from "./actions";
import { NOINDEX } from "@/lib/seo/site";

/** Private area: never in search results (robots.txt closes it too). */
export const metadata: Metadata = { robots: NOINDEX, title: "RestoCool · Super admin" };

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", key: "overview", icon: "📊" },
  { href: "/admin/businesses", key: "businesses", icon: "🏪" },
  { href: "/admin/billing", key: "billing", icon: "💳" },
  { href: "/admin/map", key: "map", icon: "🗺️" },
  { href: "/admin/activity", key: "activity", icon: "🧾" },
  { href: "/admin/settings", key: "settings", icon: "⚙️" },
] as const;

/**
 * TIBLOGICS console: only verified emails listed in SUPERADMIN_EMAILS get in (every page and
 * action checks again with requireSuperadmin).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { t, locale } = await adminI18n();
  const sa = await getSuperadmin();
  return (
    <AuthProvider>
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-nuit px-4 py-2 text-creme">
        <Link href="/admin" className="flex items-center gap-2 font-bold">
          <Logo onDark />
          <span className="rounded-full bg-or px-2 py-0.5 text-xs font-extrabold text-encre">{t("badge")}</span>
        </Link>
        <div className="flex items-center gap-3">
          <form action={adminLangAction} className="flex overflow-hidden rounded-full border border-creme/30 text-xs font-bold" data-testid="admin-lang">
            <input type="hidden" name="back" value="/admin" />
            {(["en", "fr"] as const).map((l) => (
              <button key={l} name="lang" value={l} aria-pressed={locale === l} className="min-h-9 px-3 uppercase aria-pressed:bg-creme aria-pressed:text-encre">
                {l}
              </button>
            ))}
          </form>
          <Link href="/app" className="hidden text-sm font-semibold opacity-80 hover:opacity-100 sm:inline">
            {t("openApp")} →
          </Link>
          <UserMenu />
        </div>
      </header>
      {sa ? (
        <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col md:flex-row">
          <nav aria-label={t("nav")} className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-2 py-2 md:w-56 md:shrink-0 md:flex-col md:border-r md:border-b-0 md:py-4" data-testid="admin-nav">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold whitespace-nowrap hover:bg-muted">
                <span aria-hidden>{n.icon}</span>
                {t(`navItems.${n.key}`)}
              </Link>
            ))}
          </nav>
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
        </div>
      ) : (
        <main className="mx-auto max-w-xl px-4 py-12">
          <p role="alert" className="rounded-2xl border border-border bg-surface p-6 text-center text-muted-foreground" data-testid="admin-forbidden">
            {t("forbidden")}
          </p>
        </main>
      )}
    </AuthProvider>
  );
}
