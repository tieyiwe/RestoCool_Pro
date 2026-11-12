import Link from "next/link";
import { notFound } from "next/navigation";
import { adminI18n } from "@/lib/admin/i18n";
import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth-provider";
import { Logo } from "@/components/brand/logo";
import { UserMenu } from "@/components/user-menu";
import { getSuperadmin } from "@/lib/auth/context";
import { hasPerm, PAGE_PERM } from "@/lib/admin/access";
import { getDb } from "@/db";
import { inboxCounts } from "@/lib/support/requests";
import { openDeletionCount } from "@/lib/restaurants/deletion";
import { adminLangAction } from "./actions";
import { ConsoleNav } from "@/components/admin/console-nav";
import { NOINDEX } from "@/lib/seo/site";

/** Private area: never in search results (robots.txt closes it too). */
export const metadata: Metadata = { robots: NOINDEX, title: "RestoCool · Super admin" };

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin_pro", key: "overview", icon: "📊" },
  { href: "/admin_pro/live", key: "live", icon: "🟢" },
  { href: "/admin_pro/businesses", key: "businesses", icon: "🏪" },
  { href: "/admin_pro/support", key: "support", icon: "🛟" },
  { href: "/admin_pro/recovery", key: "recovery", icon: "🔐" },
  { href: "/admin_pro/messages", key: "messages", icon: "📣" },
  { href: "/admin_pro/marketing", key: "marketing", icon: "✨" },
  { href: "/admin_pro/billing", key: "billing", icon: "💳" },
  { href: "/admin_pro/map", key: "map", icon: "🗺️" },
  { href: "/admin_pro/deletions", key: "deletions", icon: "🗑️" },
  { href: "/admin_pro/activity", key: "activity", icon: "🧾" },
  { href: "/admin_pro/team", key: "team", icon: "🧑‍🤝‍🧑" },
  { href: "/admin_pro/settings", key: "settings", icon: "⚙️" },
] as const;

/**
 * TIBLOGICS console: only verified emails listed in SUPERADMIN_EMAILS get in (every page and
 * action checks again with requireSuperadmin).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { t, locale } = await adminI18n();
  // Anyone else gets the normal « page introuvable »: the console never says it exists.
  const sa = await getSuperadmin();
  if (!sa) notFound();
  const badges: Record<string, number> = {
    ...(hasPerm(sa, "support") ? { "/admin_pro/support": (await inboxCounts(getDb()).catch(() => ({ open: 0 }))).open } : {}),
    ...(hasPerm(sa, "businesses.write") ? { "/admin_pro/deletions": await openDeletionCount(getDb()).catch(() => 0) } : {}),
  };
  const GROUPS: Array<[string, string[]]> = [
    ["pilot", ["/admin_pro", "/admin_pro/live"]],
    ["businesses", ["/admin_pro/businesses", "/admin_pro/map", "/admin_pro/billing", "/admin_pro/deletions"]],
    ["relation", ["/admin_pro/support", "/admin_pro/recovery", "/admin_pro/messages", "/admin_pro/marketing"]],
    ["platform", ["/admin_pro/activity", "/admin_pro/team", "/admin_pro/settings"]],
  ];
  const allowed = NAV.filter((n) => !PAGE_PERM[n.href] || hasPerm(sa, PAGE_PERM[n.href]!));
  const groups = GROUPS.map(([g, hrefs]) => ({
    label: t(`navGroups.${g}` as "navGroups.pilot"),
    items: allowed.filter((n) => hrefs.includes(n.href)).map((n) => ({ href: n.href, key: n.key, icon: n.icon, label: t(`navItems.${n.key}`), badge: badges[n.href] })),
  })).filter((g) => g.items.length);
  const roleName = sa.owner ? t("console.owner") : t(`team.roles.${sa.role ?? "custom"}` as "team.roles.custom");
  return (
    <AuthProvider>
      <div data-console className="min-h-dvh bg-background text-foreground md:flex">
        {/* Sidebar (tablets up) / top bar (phones): deep indigo, the console's own colour. */}
        <aside className="relative z-30 bg-[linear-gradient(180deg,var(--console-side),var(--console-side-2))] text-[var(--console-side-fg)] md:sticky md:top-0 md:flex md:h-dvh md:w-64 md:shrink-0 md:flex-col md:gap-6 md:overflow-y-auto md:px-3 md:py-5">
          <div className="flex items-center justify-between gap-2 px-4 py-3 md:px-2 md:py-0">
            <Link href="/admin_pro" className="flex items-center gap-2 font-bold" aria-label="RestoCool console">
              <Logo onDark />
              <span className="rounded-full bg-[var(--console-amber)] px-2 py-0.5 text-[11px] font-extrabold tracking-wide text-[#15123a] uppercase">{t("console.badge")}</span>
            </Link>
            <div className="md:hidden">
              <UserMenu />
            </div>
          </div>
          <ConsoleNav groups={groups} label={t("nav")} />
          <div className="mt-auto hidden flex-col gap-3 md:flex">
            <div className="rounded-2xl bg-white/8 p-3">
              <p className="truncate text-sm font-bold text-white">{sa.name ?? sa.email}</p>
              <p className="truncate text-xs opacity-70">{sa.email}</p>
              <p className="mt-1 inline-block rounded-full bg-[var(--console-amber)]/90 px-2 py-0.5 text-[11px] font-bold text-[#15123a]" data-testid="console-role">
                {roleName}
              </p>
            </div>
            <Link href="/app" className="flex min-h-10 items-center rounded-xl px-3 text-sm font-semibold opacity-80 hover:bg-white/8 hover:opacity-100">
              ↗ {t("openApp")}
            </Link>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-surface/85 px-4 py-2.5 backdrop-blur md:px-8">
            <form action="/admin_pro/businesses" className="hidden min-w-0 flex-1 sm:block" role="search">
              <label className="sr-only" htmlFor="console-search">
                {t("console.search")}
              </label>
              <input id="console-search" name="q" placeholder={`🔎 ${t("console.search")}`} className="min-h-10 w-full max-w-md rounded-xl border border-border bg-background px-3 text-sm" />
            </form>
            <div className="ml-auto flex items-center gap-3">
              <form action={adminLangAction} className="flex overflow-hidden rounded-full border border-border text-xs font-bold" data-testid="admin-lang">
                <input type="hidden" name="back" value="/admin_pro" />
                {(["en", "fr"] as const).map((l) => (
                  <button key={l} name="lang" value={l} aria-pressed={locale === l} className="min-h-9 px-3 uppercase aria-pressed:bg-primary aria-pressed:text-primary-foreground">
                    {l}
                  </button>
                ))}
              </form>
              <div className="hidden md:block">
                <UserMenu />
              </div>
            </div>
          </header>
          <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}
