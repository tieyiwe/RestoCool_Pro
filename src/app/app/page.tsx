import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { getMemberContext } from "@/lib/auth/context";
import { setupState } from "@/lib/auth/setup";
import { can } from "@/lib/auth/can";
import { effectiveStatus } from "@/lib/plan";
import { MainQrCard } from "@/components/qr/main-qr-card";
import { OrderAnalyticsPanel } from "@/components/analytics/order-analytics";
import { LearnCard } from "@/components/guide/learn-card";
import { getDb } from "@/db";
import { orderAnalytics, type Range } from "@/lib/analytics/orders";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const t = await getTranslations("app");
  const ts = await getTranslations("settings");
  const format = await getFormatter();
  const ctx = await getMemberContext();

  // Signed in but no restaurant yet: start onboarding.
  if (!ctx) redirect("/app/new");
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
  const status = effectiveStatus(r);
  // Analytics: owners and managers only (reports.read), checked on the server.
  const canReports = can(ctx.actor, "reports.read", { restaurantId: ctx.repo.restaurantId });
  const rq = (await searchParams).range;
  const range: Range = rq === "7d" || rq === "30d" ? rq : "today";
  const analytics = canReports ? await orderAnalytics(getDb(), ctx.repo.restaurantId, range) : null;
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
        <Badge variant="outline">{t(`role.${ctx.actor.role}`)}</Badge>
      </div>
      {!r.settings.onboardedAt && ctx.actor.role === "owner" && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-or bg-or/15" data-testid="onboarding-banner">
          <p className="font-semibold">{ts("wizard.banner")}</p>
          <Button asChild>
            <Link href="/app/onboarding/1">{ts("wizard.resume")}</Link>
          </Button>
        </Card>
      )}
      {status === "trial" && r.planExpiresAt && (
        <p className="text-sm text-muted-foreground">{t("plan.trialEnds", { date: format.dateTime(r.planExpiresAt, { dateStyle: "long" }) })}</p>
      )}

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

      <LearnCard audience={ctx.actor.role === "owner" || ctx.actor.role === "manager" ? "manager" : "staff"} />

      {analytics && <OrderAnalyticsPanel data={analytics} range={range} />}

      {canSeats && <MainQrCard restaurantId={r.id} slug={r.slug} published={r.published} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="text-3xl font-extrabold tabular-nums">{s.value}</p>
          </Card>
        ))}
      </div>

      {canReadAudit && (
        <Card>
          <CardTitle className="mb-3">{t("recentActivity")}</CardTitle>
          {activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noActivity")}</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {activity.map((a) => (
                <li key={a.id} className="flex justify-between gap-3 py-2">
                  <span className="font-mono">{a.action}</span>
                  <time className="text-muted-foreground" dateTime={a.createdAt.toISOString()}>
                    {format.dateTime(a.createdAt, { dateStyle: "short", timeStyle: "short" })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
