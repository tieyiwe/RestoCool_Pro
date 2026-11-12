import Link from "next/link";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { Bars } from "@/components/admin/charts";
import { Card, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db";
import { adminI18n } from "@/lib/admin/i18n";
import { liveOverview } from "@/lib/admin/live";
import { requireSuperadminPage } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

function Kpi({ label, value, sub, testId, tone }: { label: string; value: string | number; sub?: string; testId?: string; tone?: "warn" | "live" }) {
  const cls = tone === "warn" ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" : tone === "live" ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20" : "border-border bg-surface";
  return (
    <div className={`rounded-2xl border p-4 ${cls}`} data-testid={testId}>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Split({ data, labels, testId }: { data: Record<string, number>; labels: (k: string) => string; testId?: string }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  const entries = Object.entries(data).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <p className="text-sm text-muted-foreground">—</p>;
  return (
    <ul className="flex flex-col gap-2" data-testid={testId}>
      {entries.map(([k, v]) => (
        <li key={k} className="text-sm">
          <div className="flex justify-between">
            <span className="font-semibold">{labels(k)}</span>
            <span className="tabular-nums text-muted-foreground">
              {v} · {Math.round((v / Math.max(1, total)) * 100)} %
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(v / Math.max(1, total)) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Live platform: people online right now (who, which device), orders waiting vs processed, traffic. */
export default async function AdminLive() {
  await requireSuperadminPage("dashboard");
  const [{ t, format }, live] = await Promise.all([adminI18n(), liveOverview(getDb())]);
  const { presence: p, orders: o, businesses, traffic: tr } = live;
  const team = p.byAudience.owner + p.byAudience.manager + p.byAudience.staff;
  const dev = (k: string) => t(`live.devices.${k}` as "live.devices.phone");
  const os = (k: string) => t(`live.os.${k}` as "live.os.android");
  const today = tr.daily[tr.daily.length - 1];
  return (
    <div className="flex flex-col gap-6" data-testid="admin-live">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">{t("live.title")}</h1>
          <p className="text-muted-foreground">{t("live.intro")}</p>
        </div>
        <AutoRefresh every={30_000} label={t("live.updated")} />
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t("live.kpi.online")} value={p.total} sub={t("live.kpi.onlineSub", { peak: tr.peakToday, today: today?.total ?? 0 })} tone="live" testId="live-online" />
        <Kpi label={t("live.kpi.team")} value={team} sub={t("live.kpi.teamSub", { owners: p.byAudience.owner, managers: p.byAudience.manager, staff: p.byAudience.staff })} testId="live-team" />
        <Kpi label={t("live.kpi.customers")} value={p.byAudience.customer} sub={t("live.kpi.customersSub", { n: p.byAudience.visitor })} testId="live-customers" />
        <Kpi label={t("live.kpi.devices")} value={`📱 ${p.byDevice.phone} · 💻 ${p.byDevice.desktop}`} sub={t("live.kpi.devicesSub", { tablet: p.byDevice.tablet, installed: p.installed })} testId="live-devices" />
        <Kpi label={t("live.kpi.pending")} value={o.pending} sub={t("live.kpi.pendingSub", { sent: o.sent, confirmed: o.confirmed, preparing: o.preparing, ready: o.ready })} tone={o.late ? "warn" : undefined} testId="live-pending" />
        <Kpi label={t("live.kpi.late")} value={o.late} sub={t("live.kpi.lateSub")} tone={o.late ? "warn" : undefined} />
        <Kpi label={t("live.kpi.processed")} value={o.processedToday} sub={t("live.kpi.processedSub", { n: o.cancelledToday })} testId="live-processed" />
        <Kpi label={t("live.kpi.serve")} value={o.avgServeMin == null ? "—" : `${o.avgServeMin} min`} sub={t("live.kpi.serveSub")} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-2">{t("live.lastHour")}</CardTitle>
          <Bars data={tr.lastHour.map((x) => ({ k: x.t, v: x.n, title: `${x.t} · ${x.n}` }))} label={t("live.lastHour")} testId="chart-last-hour" />
        </Card>
        <Card>
          <CardTitle className="mb-2">{t("live.last24h")}</CardTitle>
          <Bars data={tr.last24h.map((x) => ({ k: x.t, v: x.n, title: `${x.t} · ${x.n}` }))} label={t("live.last24h")} color="var(--rc-or, #d4a017)" />
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle className="mb-1">{t("live.daily")}</CardTitle>
          <p className="mb-2 text-xs text-muted-foreground">{t("live.dailyHint")}</p>
          <Bars
            data={tr.daily.map((d) => ({ k: d.d.slice(5), v: d.total, title: `${d.d} · ${d.total} — ${t("live.dailyTitle", { owner: d.owner, manager: d.manager, staff: d.staff, customer: d.customer, visitor: d.visitor })}` }))}
            label={t("live.daily")}
            testId="chart-daily-visitors"
          />
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle className="mb-3">{t("live.nowByDevice")}</CardTitle>
          <Split data={p.byDevice} labels={dev} testId="live-device-split" />
        </Card>
        <Card>
          <CardTitle className="mb-3">{t("live.devices7")}</CardTitle>
          <Split data={tr.devices7} labels={dev} />
          <p className="mt-3 text-xs text-muted-foreground">{t("live.installed7", { n: tr.installed7 })}</p>
        </Card>
        <Card>
          <CardTitle className="mb-3">{t("live.os7")}</CardTitle>
          <Split data={tr.os7} labels={os} />
        </Card>
      </section>

      <Card>
        <CardTitle className="mb-1">{t("live.perBusiness")}</CardTitle>
        <p className="mb-3 text-xs text-muted-foreground">{t("live.perBusinessHint")}</p>
        {businesses.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("live.nothing")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm" data-testid="live-businesses">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">{t("live.cols.business")}</th>
                  <th className="px-2 text-right">{t("live.cols.team")}</th>
                  <th className="px-2 text-right">{t("live.cols.customers")}</th>
                  <th className="px-2 text-right">{t("live.cols.pending")}</th>
                  <th className="px-2 text-right">{t("live.cols.processed")}</th>
                  <th className="px-2 text-right">{t("live.cols.cancelled")}</th>
                  <th className="px-2 text-right">{t("live.cols.appTime")}</th>
                  <th className="pl-2 text-right">{t("live.cols.lastOrder")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {businesses.map((b) => (
                  <tr key={b.id}>
                    <td className="py-2 pr-3">
                      <Link href={`/admin_pro/businesses/${b.id}`} className="font-semibold text-primary">
                        {b.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{b.city ?? "—"}</span>
                    </td>
                    <td className="px-2 text-right tabular-nums">{b.team ? <span className="font-bold text-emerald-700">● {b.team}</span> : "0"}</td>
                    <td className="px-2 text-right tabular-nums">{b.customers}</td>
                    <td className="px-2 text-right tabular-nums">
                      {b.pending}
                      {b.late > 0 && <span className="ml-1 rounded bg-amber-100 px-1 text-xs font-bold text-amber-900">{t("live.lateN", { n: b.late })}</span>}
                    </td>
                    <td className="px-2 text-right tabular-nums">{b.processedToday}</td>
                    <td className="px-2 text-right tabular-nums">{b.cancelledToday}</td>
                    <td className="px-2 text-right tabular-nums">{t("live.minutes", { n: b.appMinutesToday, people: b.activeMembersToday })}</td>
                    <td className="pl-2 text-right text-xs text-muted-foreground">{b.lastOrderAt ? format.relativeTime(b.lastOrderAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-muted-foreground">{t("live.privacy")}</p>
    </div>
  );
}
