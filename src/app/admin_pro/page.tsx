import Link from "next/link";
import { adminI18n } from "@/lib/admin/i18n";
import { Bars, Funnel } from "@/components/admin/charts";
import { Card, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { platformOverview } from "@/lib/admin/metrics";
import { requireSuperadmin } from "@/lib/auth/context";
import { formatFCFA } from "@/lib/format";
import { getPlatformSettings } from "@/lib/platform/settings";

export const dynamic = "force-dynamic";

function Kpi({ label, value, sub, testId, tone }: { label: string; value: string | number; sub?: string; testId?: string; tone?: "warn" }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone === "warn" ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" : "border-border bg-surface"}`} data-testid={testId}>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Platform overview for TIBLOGICS: growth, usage, money, health — and what needs attention. */
export default async function AdminOverview() {
  await requireSuperadmin();
  const [t, tp, format, o, platform] = await Promise.all([adminI18n().then((x) => x.t), adminI18n().then((x) => x.tp), adminI18n().then((x) => x.format), platformOverview(getDb()), getPlatformSettings()]);
  const F = (n: number) => formatFCFA(n) ?? "0 F";
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : "—");
  const days = o.series.ordersPerDay.map((d) => ({ k: d.d.slice(5), v: d.n, title: `${d.d} · ${d.n} · ${F(d.gmv)}` }));
  const weeks = o.series.signupsPerWeek.map((w) => ({ k: w.w.slice(5), v: w.n, title: `${w.w} · ${w.n}` }));
  const plans = (["gratuit", "pro", "business"] as const).map((p) => ({
    plan: p,
    counts: (["trial", "active", "past_due", "suspended"] as const).map((s) => [s, o.plans.byPlan[`${p}:${s}`] ?? 0] as const).filter(([, n]) => n > 0),
  }));
  return (
    <div className="flex flex-col gap-6" data-testid="admin-overview">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">{t("overview.title")}</h1>
          <p className="text-muted-foreground">{t("overview.intro")}</p>
        </div>
        {platform.freeLaunch && <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-900">🎁 {t("overview.freeLaunchOn")}</span>}
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t("overview.kpi.businesses")} value={o.businesses.total} sub={t("overview.kpi.businessesSub", { published: o.businesses.published, transport: o.businesses.transport })} testId="kpi-businesses" />
        <Kpi label={t("overview.kpi.new")} value={o.businesses.new7} sub={t("overview.kpi.newSub", { n: o.businesses.new30 })} />
        <Kpi label={t("overview.kpi.active")} value={o.orders.active7} sub={t("overview.kpi.activeSub", { pct: pct(o.orders.active7, o.businesses.published), n: o.orders.active30 })} />
        <Kpi label={t("overview.kpi.ordersToday")} value={o.orders.today} sub={t("overview.kpi.ordersSub", { n7: o.orders.last7, n30: o.orders.last30 })} testId="kpi-orders" />
        <Kpi label={t("overview.kpi.gmv")} value={F(o.orders.gmv30)} sub={t("overview.kpi.gmvSub", { v: F(o.orders.gmv7) })} />
        <Kpi label={t("overview.kpi.mrr")} value={F(o.plans.mrr)} sub={t("overview.kpi.mrrSub", { v: F(o.plans.potentialMrr) })} testId="kpi-mrr" />
        <Kpi label={t("overview.kpi.paid")} value={F(o.plans.paid30)} sub={t("overview.kpi.paidSub", { n: o.plans.payments30 })} />
        <Kpi label={t("overview.kpi.errors")} value={o.errors.open} sub={t("overview.kpi.errorsSub", { n: o.errors.today })} tone={o.errors.open ? "warn" : undefined} testId="kpi-errors" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-2">{t("overview.ordersPerDay")}</CardTitle>
          {days.length ? <Bars data={days} label={t("overview.ordersPerDay")} testId="chart-orders" /> : <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        </Card>
        <Card>
          <CardTitle className="mb-2">{t("overview.signupsPerWeek")}</CardTitle>
          {weeks.length ? <Bars data={weeks} label={t("overview.signupsPerWeek")} color="var(--rc-or)" /> : <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle className="mb-3">{t("overview.funnel")}</CardTitle>
          <Funnel
            steps={[
              { label: t("overview.funnelSteps.created"), n: o.funnel.created },
              { label: t("overview.funnelSteps.setup"), n: o.funnel.setup },
              { label: t("overview.funnelSteps.menu"), n: o.funnel.menu },
              { label: t("overview.funnelSteps.published"), n: o.funnel.published },
              { label: t("overview.funnelSteps.ordered"), n: o.funnel.ordered },
            ]}
          />
        </Card>
        <Card>
          <CardTitle className="mb-3">{t("overview.plans")}</CardTitle>
          <ul className="flex flex-col gap-2 text-sm" data-testid="admin-plans">
            {plans.map((p) => (
              <li key={p.plan} className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold">{tp(p.plan)}</span>
                <span className="flex flex-wrap gap-1">
                  {p.counts.length === 0 && <span className="text-muted-foreground">0</span>}
                  {p.counts.map(([s, n]) => (
                    <Link key={s} href={`/admin_pro/businesses?plan=${p.plan}&status=${s}`} className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold hover:bg-primary/10">
                      {tp(s)} · {n}
                    </Link>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardTitle className="mb-3">{t("overview.cities")}</CardTitle>
          <ul className="flex flex-col gap-1 text-sm">
            {o.cities.map((c) => (
              <li key={c.city} className="flex justify-between">
                <span>{c.city}</span>
                <span className="font-bold tabular-nums">{c.n}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-3">{t("overview.top")}</CardTitle>
          {o.top.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ol className="flex flex-col divide-y divide-border text-sm" data-testid="admin-top">
              {o.top.map((b, i) => (
                <li key={b.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/admin_pro/businesses/${b.id}`} className="font-semibold hover:underline">
                    {i + 1}. {b.name} <span className="font-normal text-muted-foreground">· {b.city}</span>
                  </Link>
                  <span className="text-right tabular-nums">
                    {t("overview.ordersN", { n: b.n })} · {F(b.gmv)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card>
          <CardTitle className="mb-3">⏰ {t("overview.expiring")}</CardTitle>
          {o.expiring.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("overview.expiringNone")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border text-sm" data-testid="admin-expiring">
              {o.expiring.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/admin_pro/businesses/${b.id}#plan`} className="font-semibold hover:underline">
                    {b.name}
                  </Link>
                  <span className="text-xs">
                    {tp(b.plan)} · {tp(b.plan_status)} · {format.dateTime(b.plan_expires_at, { dateStyle: "medium" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
