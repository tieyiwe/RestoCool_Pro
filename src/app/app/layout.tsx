import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { AuthProvider } from "@/components/auth-provider";
import { Logo } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { RestaurantSwitcher } from "@/components/restaurant-switcher";
import { UserMenu } from "@/components/user-menu";
import { BottomTabs } from "@/components/app-shell/bottom-tabs";
import { RegisterStaffSw } from "@/components/app-shell/register-sw";
import { NavProgress } from "@/components/app-shell/nav-progress";
import { JoinPrompt } from "@/components/app-shell/join-prompt";
import { PinSessionBar } from "@/components/app-shell/pin-session-bar";
import { formatStaffNo } from "@/lib/personnel";
import { getDb } from "@/db";
import { pendingJoinRequests } from "@/lib/personnel/join";
import { Suspense } from "react";
import { env } from "@/lib/env";
import { setupState } from "@/lib/auth/setup";
import { can, type Action } from "@/lib/auth/can";
import { getMemberContext, getSuperadmin } from "@/lib/auth/context";
import { getPlatformSettings } from "@/lib/platform/settings";
import type { Metadata } from "next";
import { NOINDEX } from "@/lib/seo/site";
import { CommandPalette } from "@/components/app-shell/command-palette";
import { HelpLink } from "@/components/app-shell/help-link";
import { InstallApp } from "@/components/app-shell/install-app";
import { NotificationBell } from "@/components/app-shell/notification-bell";
import { SideNav } from "@/components/app-shell/side-nav";
import { notificationSummary } from "@/lib/platform/notifications";

/** Private area: never in search results (robots.txt closes it too). */
export const metadata: Metadata = { robots: NOINDEX };

export const dynamic = "force-dynamic";

export default async function StaffAppLayout({ children }: { children: React.ReactNode }) {
  const [t, tn, ts] = await Promise.all([getTranslations("app"), getTranslations("notifications"), getTranslations("support")]);
  // Business first: until it is created and set up, no other section is shown (focus mode).
  const focus = (await setupState().catch(() => "none" as const)) !== "ready";
  const ctx = await getMemberContext().catch(() => null);
  const [platform, locale] = await Promise.all([getPlatformSettings(), getLocale()]);
  const announcement = platform.announcement?.active && platform.announcement.text.fr ? platform.announcement : null;
  // Each person only sees the sections their role can open (the server checks again on every page).
  const allowed = (a: Action | null) => !a || (ctx ? can(ctx.actor, a, { restaurantId: ctx.repo.restaurantId }) : false);
  // A bus company manages buses and itineraries instead of tables and rooms.
  const transport = ctx ? (await ctx.repo.restaurant.get().catch(() => null))?.kind === "transport" : false;
  const nav = (
    [
      { href: "/app", label: t("dashboard"), icon: "🏠", need: null },
      { href: "/app/service", label: t("frontDesk"), icon: "🛎️", need: "orders.read" },
      ...(transport ? ([{ href: "/app/trips", label: t("trips"), icon: "🛣️", need: "orders.confirm" }] as const) : []),
      { href: "/app/kitchen", label: t("kitchen"), icon: "👩‍🍳", need: "orders.read" },
      { href: "/app/scan", label: t("scan"), icon: "📷", need: null },
      { href: "/app/orders", label: t("history"), icon: "🧾", need: "reports.read" },
      { href: "/app/menu", label: t("menu"), icon: "📖", need: "menu.write" },
      transport
        ? ({ href: "/app/buses", label: t("buses"), icon: "🚌", need: "seats.write" } as const)
        : ({ href: "/app/seating", label: t("seating"), icon: "🪑", need: "seats.write" } as const),
      { href: "/app/staff", label: t("staff"), icon: "👥", need: "staff.write" },
      { href: "/app/settings", label: t("settings"), icon: "⚙️", need: "settings.write" },
      { href: "/app/guide", label: t("guide"), icon: "🎓", need: null },
      { href: "/app/support", label: t("supportNav"), icon: "🛟", need: null },
      { href: "/app/notifications", label: t("notificationsNav"), icon: "🔔", need: null },
    ] as const
  ).filter((n) => allowed(n.need));
  // The RestoCool team (super admin) also gets the platform console.
  if (await getSuperadmin().catch(() => null)) nav.push({ href: "/admin_pro" as "/app/guide", label: t("superadmin"), icon: "🛡️" as "🎓", need: null });
  // Phones: the 4 most used screens for this role as tabs, the rest under « Plus ».
  const kitchenOnly = allowed("orders.prepare") && !allowed("orders.confirm");
  const order = transport
    ? ["/app", "/app/trips", "/app/scan", "/app/service"]
    : kitchenOnly
      ? ["/app/kitchen", "/app/scan", "/app"]
      : ["/app", "/app/service", "/app/scan", allowed("orders.prepare") && !allowed("reports.read") ? "/app/kitchen" : "/app/orders"];
  const tabs = order.map((h) => nav.find((n) => n.href === h)).filter((n): n is (typeof nav)[number] => Boolean(n)).slice(0, 4);
  const more = nav.filter((n) => !tabs.includes(n));
  const toTab = (n: (typeof nav)[number]) => ({ href: n.href, label: n.label, icon: n.icon });
  const SHORT: Record<string, "home" | "service" | "kitchen" | "history" | "scan" | "trips"> = {
    "/app": "home",
    "/app/service": "service",
    "/app/kitchen": "kitchen",
    "/app/orders": "history",
    "/app/scan": "scan",
    "/app/trips": "trips",
  };
  const toShortTab = (n: (typeof nav)[number]) => ({ ...toTab(n), label: SHORT[n.href] ? t(`tabs.${SHORT[n.href]}`) : n.label });
  // Personnel managers are prompted live when someone asks to join the team.
  const joinPending = !focus && ctx && allowed("staff.write") ? await pendingJoinRequests(getDb(), ctx.repo.restaurantId).catch(() => []) : null;
  // Desktop sidebar: the same sections, grouped like desktop software.
  const GROUP: Record<string, "service" | "manage" | "help"> = {
    "/app/menu": "manage",
    "/app/seating": "manage",
    "/app/buses": "manage",
    "/app/staff": "manage",
    "/app/settings": "manage",
    "/app/guide": "help",
    "/app/support": "help",
    "/app/notifications": "help",
    "/admin_pro": "help",
  };
  const db = getDb();
  const summary = ctx ? await notificationSummary(db, ctx, locale).catch(() => ({ unread: 0, support: 0, popup: null })) : null;
  const groups = (["service", "manage", "help"] as const)
    .map((g) => ({
      label: t(`navGroups.${g}`),
      items: nav
        .filter((n) => (GROUP[n.href] ?? "service") === g)
        .map((n) => ({ href: n.href, label: n.label, icon: n.icon, badge: n.href === "/app/notifications" ? (summary ? summary.unread + summary.support : 0) : undefined })),
    }))
    .filter((g) => g.items.length);
  const lead = ctx ? ctx.actor.role === "owner" || ctx.actor.role === "manager" : false;
  const installLabels = { title: t("install.title"), text: t("install.text"), install: t("install.install"), later: t("install.later"), safariMac: t("install.safariMac"), ios: t("install.ios"), done: t("install.done") };
  const bellLabels = {
    bell: tn("bell"),
    newTitle: tn("newTitle"),
    open: tn("see"),
    later: tn("later"),
    kinds: { feature: tn("kinds.feature"), news: tn("kinds.news"), maintenance: tn("kinds.maintenance"), billing: tn("kinds.billing"), message: tn("kinds.message") },
  };
  return (
    <AuthProvider>
      <div className="flex min-h-dvh">
        {!focus && (
          <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-surface px-3 py-4 md:flex print:hidden" data-testid="app-sidebar">
            <Link href="/" aria-label="RestoCool" className="px-2">
              <Logo />
            </Link>
            {!ctx?.pin && (
              <div className="px-1">
                <RestaurantSwitcher id="restaurant-switcher-side" />
              </div>
            )}
            <SideNav groups={groups} label={t("title")} />
            <div className="mt-auto flex flex-col gap-3 pt-4">
              {lead && <InstallApp labels={installLabels} />}
              <HelpLink label={ts("help")} variant="button" />
              <p className="px-2 text-[11px] text-muted-foreground">RestoCool · TIBLOGICS</p>
            </div>
          </aside>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-surface/90 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-surface/75 md:px-6 print:hidden">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/" aria-label="RestoCool" className={focus ? "" : "md:hidden"}>
                <Logo />
              </Link>
              {!focus && <CommandPalette items={nav.map((n) => ({ href: n.href, label: n.label, icon: n.icon }))} labels={{ open: t("palette.open"), placeholder: t("palette.placeholder"), empty: t("palette.empty"), hint: t("palette.hint") }} />}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {summary && <NotificationBell initial={summary} labels={bellLabels} />}
              {ctx && <HelpLink label={ts("help")} />}
              {ctx?.pin ? (
                <>
                  <LocaleSwitcher />
                  <PinSessionBar name={ctx.pin.name} staffNo={formatStaffNo(ctx.pin.staffNo)} idleMinutes={ctx.pin.idleMinutes} />
                </>
              ) : (
                <>
                  <div className={focus ? "" : "md:hidden"}>
                    <RestaurantSwitcher />
                  </div>
                  <LocaleSwitcher />
                  <UserMenu />
                </>
              )}
            </div>
          </header>
          {!env.clerkConfigured() && env.devAuthBypass() && (
            <p role="status" className="bg-amber-100 print:hidden px-4 py-1.5 text-center text-xs font-semibold text-amber-900">
              {t("devBypass")}
            </p>
          )}
          <RegisterStaffSw />
          {announcement && (
            // Message from the RestoCool team to every business (maintenance, news…), set in the console.
            <p
              role="status"
              className={announcement.level === "warning" ? "bg-amber-100 px-4 py-2 text-center text-sm font-semibold text-amber-950 print:hidden" : "bg-sky-50 px-4 py-2 text-center text-sm font-semibold text-sky-950 print:hidden"}
              data-testid="platform-announcement"
            >
              📣 {announcement.text[locale as "fr"] || announcement.text.fr}
            </p>
          )}
          <Suspense fallback={null}>
            <NavProgress />
          </Suspense>
          {focus ? (
            <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
          ) : (
            <>
              <main className="flex-1 px-4 pt-5 pb-[calc(env(safe-area-inset-bottom)+6rem)] md:px-8 md:py-8 print:p-0">
                <div className="mx-auto w-full max-w-7xl">{children}</div>
              </main>
              {joinPending && <JoinPrompt initial={{ count: joinPending.length, latest: joinPending[0] ? { id: joinPending[0].id, name: joinPending[0].name } : null }} />}
              <BottomTabs tabs={tabs.map(toShortTab)} more={more.map(toTab)} moreLabel={t("more")} closeLabel={t("close")} />
            </>
          )}
        </div>
      </div>
    </AuthProvider>
  );
}
