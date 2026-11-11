import Link from "next/link";
import { getTranslations } from "next-intl/server";
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
import { getMemberContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export default async function StaffAppLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("app");
  // Business first: until it is created and set up, no other section is shown (focus mode).
  const focus = (await setupState().catch(() => "none" as const)) !== "ready";
  const ctx = await getMemberContext().catch(() => null);
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
    ] as const
  ).filter((n) => allowed(n.need));
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
  return (
    <AuthProvider>
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-20 flex print:hidden items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2">
          <Link href="/" aria-label="RestoCool">
            <Logo />
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {ctx?.pin ? (
              <>
                <LocaleSwitcher />
                <PinSessionBar name={ctx.pin.name} staffNo={formatStaffNo(ctx.pin.staffNo)} idleMinutes={ctx.pin.idleMinutes} />
              </>
            ) : (
              <>
                <RestaurantSwitcher />
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
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        {focus ? (
          <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
        ) : (
        <div className="flex flex-1 flex-col md:flex-row">
          <nav aria-label={t("title")} className="hidden print:hidden gap-1 border-r border-border bg-surface px-2 py-4 md:flex md:w-56 md:flex-col">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium hover:bg-muted">
                <span aria-hidden>{n.icon}</span>
                {n.label}
              </Link>
            ))}
          </nav>
          <main className="flex-1 px-4 pt-5 pb-[calc(env(safe-area-inset-bottom)+6rem)] md:px-8 md:py-6 print:p-0">{children}</main>
          {joinPending && <JoinPrompt initial={{ count: joinPending.length, latest: joinPending[0] ? { id: joinPending[0].id, name: joinPending[0].name } : null }} />}
          <BottomTabs tabs={tabs.map(toShortTab)} more={more.map(toTab)} moreLabel={t("more")} closeLabel={t("close")} />
        </div>
        )}
      </div>
    </AuthProvider>
  );
}
