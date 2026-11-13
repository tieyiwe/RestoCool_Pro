import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { getMemberContext } from "@/lib/auth/context";
import { setupState } from "@/lib/auth/setup";
import { redirectWithoutMember } from "@/lib/auth/page";
import { can } from "@/lib/auth/can";
import { effectiveStatus } from "@/lib/plan";
import { getPlatformSettings } from "@/lib/platform/settings";
import { MainQrCard } from "@/components/qr/main-qr-card";
import { CustomizeGuide, customizeSteps } from "@/components/onboarding/customize-guide";
import { OrderAnalyticsPanel } from "@/components/analytics/order-analytics";
import { LearnCard } from "@/components/guide/learn-card";
import { getDb } from "@/db";
import { orderAnalytics, type Range } from "@/lib/analytics/orders";
import { liveStatus, personnelRanking, type RankedPerson } from "@/lib/analytics/backoffice";
import { ActivityFeed, Alerts, LiveStrip, RankingCard, Shortcuts, type Alert, type Shortcut } from "@/components/backoffice/backoffice";
import { attendanceEnabled } from "@/lib/personnel/attendance";
import { personnel } from "@/lib/personnel";
import { pendingJoinCount } from "@/lib/personnel/join";
import { hasFeature } from "@/lib/plan";
import { floorStatus } from "@/lib/seating/floor";
import { FloorPlan } from "@/components/service/floor-plan";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const t = await getTranslations("app");
  const ts = await getTranslations("settings");
  const format = await getFormatter();
  const ctx = await getMemberContext();

  // Signed in but no restaurant yet: start onboarding.
  if (!ctx) return redirectWithoutMember();
  // The setup comes first: the dashboard opens once it is finished.
  if ((await setupState()) === "setup") redirect("/app/onboarding/1");

  const r = await ctx.repo.restaurant.get();
  if (!r) return null;
  // The activity feed is the audit log: managers and owners only (audit.read).
  const canReadAudit = can(ctx.actor, "audit.read", { restaurantId: ctx.repo.restaurantId });
  const [categories, itemCount, seats, areas, activity] = await Promise.all([
    ctx.repo.menu.categories(),
    ctx.repo.menu.countItems(),
    ctx.repo.seating.seats(),
    ctx.repo.seating.areas(),
    canReadAudit ? ctx.repo.audit.recent(10) : Promise.resolve([]),
  ]);
  const freeLaunch = (await getPlatformSettings()).freeLaunch;
  const status = effectiveStatus(r);
  // Analytics: owners and managers only (reports.read), checked on the server.
  const canReports = can(ctx.actor, "reports.read", { restaurantId: ctx.repo.restaurantId });
  const rq = (await searchParams).range;
  const range: Range = rq === "7d" || rq === "30d" ? rq : "today";
  const db = getDb();
  const rid = ctx.repo.restaurantId;
  const [analytics, live, ranking, people] = await Promise.all([
    canReports ? orderAnalytics(db, rid, range) : null,
    canReports ? liveStatus(db, rid) : null,
    canReports ? personnelRanking(db, rid, range) : null,
    personnel(db, rid),
  ]);
  const allowed = (a: Parameters<typeof can>[1]) => can(ctx.actor, a, { restaurantId: rid });
  // Live floor plan: businesses with tables or private rooms, for anyone who follows the service.
  const hasFloor = r.kind !== "transport" && seats.some((s) => s.active && (s.type === "table" || s.type === "room")) && hasFeature(r, "kitchenDisplay") && allowed("orders.read");
  const floor = hasFloor ? await floorStatus(db, rid) : null;
  const tro = await getTranslations("roles");
  const roleLabel = (p: { role: string; roleKey?: string | null; roleName?: string | null }) =>
    p.role === "owner" ? t("role.owner") : p.roleKey ? tro(`names.${p.roleKey}` as "names.server") : (p.roleName ?? t(`role.${p.role}` as "role.server"));
  const me = people.find((p) => p.id === ctx.memberships.find((m) => m.restaurantId === rid)?.memberId);
  const myRole = me ? roleLabel({ role: me.role, roleKey: me.jobRoleKey, roleName: me.jobRoleName }) : t(`role.${ctx.actor.role}`);
  const attendance = attendanceEnabled(r);
  const alerts: Alert[] = [];
  if (live) {
    if (live.waitingOrders) alerts.push({ key: "waiting", n: live.waitingOrders, href: "/app/service", tone: "red" });
    if (live.readyOrders) alerts.push({ key: "ready", n: live.readyOrders, href: "/app/service", tone: "amber" });
    if (live.locked) alerts.push({ key: "locked", n: live.locked, href: "/app/staff", tone: "amber" });
    if (live.soldOut) alerts.push({ key: "soldOut", n: live.soldOut, href: "/app/menu", tone: "info" });
  }
  if (allowed("staff.write")) {
    const waiting = await pendingJoinCount(db, rid);
    if (waiting) alerts.push({ key: "join", n: waiting, href: "/app/staff#join", tone: "red" });
  }
  if (allowed("settings.write")) {
    if (!r.published) alerts.push({ key: "unpublished", href: "/app/settings#publish", tone: "amber" });
    if (r.latitude == null) alerts.push({ key: "noLocation", href: "/app/settings#location", tone: "info" });
    if (!r.coverUrl) alerts.push({ key: "noPhoto", href: "/app/settings#appearance", tone: "info" });
  }
  const shortcuts = (
    [
      { key: "frontDesk", href: "/app/service", icon: "🛎️", need: "orders.read" },
      { key: "kitchen", href: "/app/kitchen", icon: "👩‍🍳", need: "orders.read" },
      { key: "history", href: "/app/orders", icon: "🧾", need: "reports.read" },
      { key: "menu", href: "/app/menu", icon: "📖", need: "menu.write" },
      ...(r.kind === "transport"
        ? ([{ key: "buses", href: "/app/buses", icon: "🚌", need: "seats.write" }] as const)
        : ([
            { key: "seating", href: "/app/seating", icon: "🪑", need: "seats.write" },
            { key: "qr", href: "/app/seating/print?qr=main&layout=grid", icon: "🖨️", need: "seats.write" },
          ] as const)),
      { key: "staff", href: "/app/staff", icon: "👥", need: "staff.write" },
      { key: "invite", href: "/app/staff#add", icon: "➕", need: "staff.write" },
      { key: "roles", href: "/app/staff/roles", icon: "🔑", need: "staff.write" },
      { key: "devices", href: "/app/staff/devices", icon: "📟", need: "devices.write" },
      { key: "settings", href: "/app/settings", icon: "⚙️", need: "settings.write" },
      { key: "menuPage", href: `/r/${r.slug}`, icon: "📱", need: null },
      { key: "guide", href: "/app/guide", icon: "🎓", need: null },
    ] as const
  ).filter((x) => !x.need || allowed(x.need)) satisfies readonly Shortcut[];
  const canManage = can(ctx.actor, "settings.write", { restaurantId: ctx.repo.restaurantId });
  const canSeats = can(ctx.actor, "seats.write", { restaurantId: ctx.repo.restaurantId });
  const placeSeats = seats.filter((s) => s.type === "table" || s.type === "room" || s.type === "area");
  const steps = [
    { key: "branding", done: Boolean(r.logoUrl), href: "/app/settings#appearance" },
    { key: "dishes", done: itemCount > 0, href: "/app/menu" },
    { key: "seats", done: placeSeats.length > 0, href: "/app/seating" },
    { key: "print", done: false, href: "/app/seating/print?qr=main&layout=grid" },
    { key: "publish", done: r.published, href: "/app/settings#publish" },
  ] as const;
  const showSteps = canManage && !(r.logoUrl && itemCount > 0 && placeSeats.length > 0 && r.published);

  const stats = [
    { label: t("stats.categories"), value: categories.length },
    { label: t("stats.items"), value: itemCount },
    { label: t("stats.seats"), value: seats.length },
    { label: t("stats.areas"), value: areas.length },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold" data-testid="restaurant-name">
          {r.name}
        </h1>
        <Badge>{t(`plan.${r.plan}`)}</Badge>
        <Badge variant={status === "active" || status === "trial" ? "muted" : "warning"}>{t(`plan.${status}`)}</Badge>
        <Badge variant="outline" data-testid="my-role">{myRole}</Badge>
      </div>
      {!r.settings.onboardedAt && ctx.actor.role === "owner" && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-or bg-or/15" data-testid="onboarding-banner">
          <p className="font-semibold">{ts("wizard.banner")}</p>
          <Button asChild>
            <Link href="/app/onboarding/1">{ts("wizard.resume")}</Link>
          </Button>
        </Card>
      )}
      {status === "trial" && freeLaunch ? (
        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300" data-testid="free-launch">
          🎁 {t("plan.freeLaunch")}
        </p>
      ) : (
        status === "trial" &&
        r.planExpiresAt && <p className="text-sm text-muted-foreground">{t("plan.trialEnds", { date: format.dateTime(r.planExpiresAt, { dateStyle: "long" }) })}</p>
      )}

      {/* Until the page is fully personalised: the visual guide (logo, photo, slogan, colours…). */}
      {can(ctx.actor, "settings.write", { restaurantId: r.id }) && customizeSteps(r).some((s) => !s.done) && <CustomizeGuide r={r} />}
      {showSteps && (
        <Card data-testid="next-steps">
          <CardTitle className="mb-3">{t("nextSteps.title")}</CardTitle>
          <ol className="flex flex-col gap-2">
            {steps.map((s, i) => (
              <li key={s.key}>
                <Link href={s.href} className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 py-2 hover:bg-muted" data-done={s.done}>
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${s.done ? "bg-primary text-primary-foreground" : "bg-muted"}`} aria-hidden>
                    {s.done ? "✓" : i + 1}
                  </span>
                  <span className={s.done ? "text-muted-foreground line-through" : "font-semibold"}>{t(`nextSteps.${s.key}`)}</span>
                  {s.done && <span className="sr-only">({t("nextSteps.done")})</span>}
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {live && <LiveStrip live={live} attendance={attendance} />}
      {floor && <FloorPlan initial={floor} canRelease={allowed("orders.serve")} />}
      {canReports && <Alerts alerts={alerts} />}
      <Shortcuts items={[...shortcuts]} />

      {analytics && <OrderAnalyticsPanel data={analytics} range={range} />}
      {ranking && <RankingCard people={ranking} range={range} roleOf={(p: RankedPerson) => roleLabel(p)} />}

      <LearnCard audience={ctx.actor.role === "owner" || ctx.actor.role === "manager" ? "manager" : "staff"} />

      {canSeats && <MainQrCard restaurantId={r.id} slug={r.slug} published={r.published} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="text-3xl font-extrabold tabular-nums">{s.value}</p>
          </Card>
        ))}
      </div>

      {canReadAudit && <ActivityFeed items={activity} />}
    </div>
  );
}
