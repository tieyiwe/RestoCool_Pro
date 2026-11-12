import { desc, eq, sql } from "drizzle-orm";
import { adminI18n } from "@/lib/admin/i18n";
import Link from "next/link";
import { Bars } from "@/components/admin/charts";
import { Card, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { planEvents, restaurants } from "@/db/schema";
import { platformOverview } from "@/lib/admin/metrics";
import { requireSuperadminPage } from "@/lib/auth/context";
import { formatFCFA } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Plans and money: income per month, every payment and plan change, renewals coming up. */
export default async function AdminBilling() {
  await requireSuperadminPage();
  const db = getDb();
  const [t, tp, format, o, events, months] = await Promise.all([
    adminI18n().then((x) => x.t),
    adminI18n().then((x) => x.tp),
    adminI18n().then((x) => x.format),
    platformOverview(db),
    db
      .select({ e: planEvents, name: restaurants.name })
      .from(planEvents)
      .innerJoin(restaurants, eq(restaurants.id, planEvents.restaurantId))
      .orderBy(desc(planEvents.createdAt))
      .limit(200),
    db.execute<{ m: string; v: number; n: number }>(sql`
      select to_char(date_trunc('month', created_at), 'YYYY-MM') as m, coalesce(sum(amount), 0)::bigint as v, count(*) filter (where amount > 0)::int as n
      from plan_events where created_at >= now() - interval '12 months' group by 1 order by 1`),
  ]);
  const F = (n: number | null) => formatFCFA(n ?? 0) ?? "0 F";
  const income = months.rows.map((r) => ({ k: r.m, v: Number(r.v), title: `${r.m} · ${F(Number(r.v))} · ${r.n}` }));
  return (
    <div className="flex flex-col gap-5" data-testid="admin-billing">
      <div>
        <h1 className="text-2xl font-extrabold">{t("billing.title")}</h1>
        <p className="text-muted-foreground">{t("billing.intro")}</p>
      </div>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [t("overview.kpi.mrr"), F(o.plans.mrr)],
          [t("billing.potential"), F(o.plans.potentialMrr)],
          [t("overview.kpi.paid"), F(o.plans.paid30)],
          [t("billing.payments30"), String(o.plans.payments30)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-xs font-semibold text-muted-foreground">{k}</p>
            <p className="mt-1 text-xl font-extrabold tabular-nums">{v}</p>
          </div>
        ))}
      </section>
      <Card>
        <CardTitle className="mb-2">{t("billing.perMonth")}</CardTitle>
        {income.length ? <Bars data={income} label={t("billing.perMonth")} /> : <p className="text-sm text-muted-foreground">{t("billing.noPayments")}</p>}
      </Card>
      <Card>
        <CardTitle className="mb-2">⏰ {t("overview.expiring")}</CardTitle>
        {o.expiring.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("overview.expiringNone")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {o.expiring.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
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
      <Card>
        <CardTitle className="mb-2">📜 {t("billing.events")}</CardTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm" data-testid="admin-billing-events">
            <thead className="text-xs text-muted-foreground uppercase">
              <tr>
                <th className="py-2">{t("cols.date")}</th>
                <th className="py-2">{t("cols.business")}</th>
                <th className="py-2">{t("cols.change")}</th>
                <th className="py-2 text-right">{t("fields.amount")}</th>
                <th className="py-2">{t("fields.method")}</th>
                <th className="py-2">{t("cols.by")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map(({ e, name }) => (
                <tr key={e.id}>
                  <td className="py-2 text-xs">{format.dateTime(e.createdAt, { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="py-2">
                    <Link href={`/admin_pro/businesses/${e.restaurantId}`} className="font-semibold hover:underline">
                      {name}
                    </Link>
                  </td>
                  <td className="py-2 text-xs">
                    {e.fromPlan ? `${tp(e.fromPlan)} · ${e.fromStatus ? tp(e.fromStatus) : ""} → ` : ""}
                    {tp(e.toPlan)} · {tp(e.toStatus)}
                  </td>
                  <td className="py-2 text-right tabular-nums">{e.amount ? F(e.amount) : "—"}</td>
                  <td className="py-2 text-xs">
                    {e.method ? t(`methods.${e.method}` as "methods.cash") : ""}
                    {e.reference ? ` · ${e.reference}` : ""}
                  </td>
                  <td className="py-2 text-xs">{e.bySuperadmin ?? (e.automatic ? t("auto") : "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
