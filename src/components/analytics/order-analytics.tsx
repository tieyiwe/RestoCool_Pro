import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Card, CardTitle } from "@/components/ui/card";
import { pickText } from "@/i18n/config";
import type { OrderAnalytics, Range } from "@/lib/analytics/orders";
import { formatFCFA } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Owner / manager analytics: orders, sales, service times, busy hours, top dishes, personnel. */
export async function OrderAnalyticsPanel({ data, range }: { data: OrderAnalytics; range: Range }) {
  const t = await getTranslations("analytics");
  const locale = await getLocale();
  const max = Math.max(1, ...data.byHour);
  const firstHour = data.byHour.findIndex((c) => c > 0);
  const lastHour = 23 - [...data.byHour].reverse().findIndex((c) => c > 0);
  const hours = firstHour === -1 ? [] : data.byHour.slice(Math.max(0, firstHour - 1), Math.min(24, lastHour + 2)).map((c, i) => ({ h: Math.max(0, firstHour - 1) + i, c }));
  const kpis = [
    { key: "orders", value: String(data.orders), sub: data.open ? t("openNow", { n: data.open }) : null },
    { key: "revenue", value: formatFCFA(data.revenue), sub: t("servedCount", { n: data.served }) },
    { key: "avgTicket", value: data.served ? formatFCFA(data.avgTicket) : "—", sub: null },
    { key: "avgService", value: data.avgServiceMin == null ? "—" : t("minutes", { n: data.avgServiceMin }), sub: data.avgPrepMin == null ? null : t("prep", { n: data.avgPrepMin }) },
    { key: "cancelled", value: String(data.cancelled), sub: null },
  ] as const;
  return (
    <section className="flex flex-col gap-4" aria-labelledby="analytics-title" data-testid="analytics">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="analytics-title" className="text-xl font-extrabold">
          {t("title")}
        </h2>
        <nav className="flex gap-1 rounded-full bg-muted p-1" aria-label={t("period")}>
          {(["today", "7d", "30d"] as const).map((r) => (
            <Link
              key={r}
              href={`/app?range=${r}`}
              aria-current={range === r ? "page" : undefined}
              className={cn("flex min-h-11 items-center rounded-full px-4 text-sm font-semibold", range === r ? "bg-surface shadow-sm" : "text-muted-foreground")}
            >
              {t(`range.${r}`)}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.key} className="p-4" data-testid={`kpi-${k.key}`}>
            <p className="text-sm text-muted-foreground">{t(`kpi.${k.key}`)}</p>
            <p className="text-2xl font-extrabold tabular-nums">{k.value}</p>
            {k.sub && <p className="text-xs text-muted-foreground">{k.sub}</p>}
          </Card>
        ))}
      </div>

      {data.orders === 0 && data.cancelled === 0 ? (
        <Card className="text-center text-muted-foreground">{t("empty")}</Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardTitle className="mb-3">{t("byHour")}</CardTitle>
            <div className="flex h-36 items-end gap-1" role="img" aria-label={t("byHourAlt")}>
              {hours.map(({ h, c }) => (
                <div key={h} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] tabular-nums text-muted-foreground">{c || ""}</span>
                  <div className="w-full rounded-t bg-primary" style={{ height: `${(c / max) * 100}px`, minHeight: c ? 4 : 1, opacity: c ? 1 : 0.2 }} />
                  <span className="text-[10px] tabular-nums text-muted-foreground">{h}h</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardTitle className="mb-3">{t("topDishes")}</CardTitle>
            <ol className="flex flex-col gap-2">
              {data.topDishes.map((d, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="mr-2 font-bold text-muted-foreground">{i + 1}.</span>
                    {d.code && <span className="text-muted-foreground">{d.code}. </span>}
                    {pickText(d.name, locale)}
                  </span>
                  <span className="font-bold tabular-nums">× {d.qty}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t("note")}</p>
    </section>
  );
}
