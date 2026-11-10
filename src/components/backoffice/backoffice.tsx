import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card, CardTitle } from "@/components/ui/card";
import { APP_ACTIONS_CAP, SCORE_WEIGHTS, type RankedPerson } from "@/lib/analytics/backoffice";
import type { Range } from "@/lib/analytics/orders";
import { formatFCFA } from "@/lib/format";
import { cn } from "@/lib/utils";

type Live = { openOrders: number; waitingOrders: number; readyOrders: number; ordersToday: number; revenueToday: number; present: number; locked: number; soldOut: number };

/** « En direct »: today's figures, each one opening the page where you act on it. */
export async function LiveStrip({ live, attendance }: { live: Live; attendance: boolean }) {
  const t = await getTranslations("backoffice.live");
  const tiles = [
    { key: "revenue", value: formatFCFA(live.revenueToday) ?? "0 F", href: "/app/orders?range=today" },
    { key: "orders", value: String(live.ordersToday), href: "/app/orders?range=today" },
    { key: "open", value: String(live.openOrders), href: "/app/service", hot: live.openOrders > 0 },
    ...(attendance ? [{ key: "present", value: String(live.present), href: "/app/staff" }] : []),
    { key: "soldOut", value: String(live.soldOut), href: "/app/menu" },
  ];
  return (
    <section aria-labelledby="live-title" className="flex flex-col gap-2" data-testid="live-strip">
      <h2 id="live-title" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        <span className="relative flex size-2.5" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2.5 rounded-full bg-emerald-600" />
        </span>
        {t("title")}
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((x) => (
          <Link
            key={x.key}
            href={x.href}
            className={cn("flex min-h-20 flex-col justify-between rounded-2xl border border-border bg-surface p-3 hover:bg-muted/60", "hot" in x && x.hot && "border-primary bg-primary/5")}
            data-testid={`live-${x.key}`}
          >
            <span className="text-xs font-semibold text-muted-foreground">{t(x.key)}</span>
            <span className="text-2xl font-extrabold tabular-nums">{x.value}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export type Alert = { key: string; href: string; n?: number; tone: "red" | "amber" | "info" };

/** « À surveiller »: only what needs a decision now. Nothing to show = a calm « tout va bien ». */
export async function Alerts({ alerts }: { alerts: Alert[] }) {
  const t = await getTranslations("backoffice.alerts");
  return (
    <Card data-testid="alerts">
      <CardTitle className="mb-2">{t("title")}</CardTitle>
      {alerts.length === 0 ? (
        <p className="text-sm text-emerald-800" data-testid="alerts-ok">
          ✓ {t("allGood")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {alerts.map((a) => (
            <li key={a.key}>
              <Link
                href={a.href}
                className={cn(
                  "flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-semibold",
                  a.tone === "red" && "bg-red-50 text-red-900",
                  a.tone === "amber" && "bg-amber-50 text-amber-900",
                  a.tone === "info" && "bg-muted text-foreground",
                )}
                data-testid={`alert-${a.key}`}
              >
                <span>{t(a.key, { n: a.n ?? 0 })}</span>
                <span aria-hidden>→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export type Shortcut = { key: string; href: string; icon: string };

/** Every section of the business in one tap (only those the person may open). */
export async function Shortcuts({ items }: { items: Shortcut[] }) {
  const t = await getTranslations("backoffice.shortcuts");
  return (
    <section aria-labelledby="shortcuts-title" className="flex flex-col gap-2">
      <h2 id="shortcuts-title" className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
        {t("title")}
      </h2>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6" data-testid="shortcuts">
        {items.map((s) => (
          <Link
            key={s.key}
            href={s.href}
            className="flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl border border-border bg-surface p-2 text-center text-xs font-semibold leading-tight hover:bg-muted/60 active:scale-[.97] motion-reduce:active:scale-100"
          >
            <span className="text-2xl" aria-hidden>
              {s.icon}
            </span>
            {t(s.key)}
          </Link>
        ))}
      </div>
    </section>
  );
}

const MEDALS = ["🥇", "🥈", "🥉"];

/** Personnel ranked by activity: work done, time present and use of the app for the business. */
export async function RankingCard({ people, range, roleOf }: { people: RankedPerson[]; range: Range; roleOf: (p: RankedPerson) => string }) {
  const t = await getTranslations("backoffice.ranking");
  const format = await getFormatter();
  const now = Date.now();
  const seen = (d: Date | null) => {
    if (!d) return t("neverSeen");
    const min = Math.round((now - d.getTime()) / 60_000);
    if (min < 10) return t("activeNow");
    return format.relativeTime(d, new Date(now));
  };
  const hours = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
  const top = Math.max(1, ...people.map((p) => p.score));
  return (
    <Card className="flex flex-col gap-3 p-0" data-testid="ranking">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
        <CardTitle>{t("title")}</CardTitle>
        <span className="text-xs text-muted-foreground">{t(`period.${range}`)}</span>
      </div>
      {people.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border">
          {people.map((p) => (
            <li key={p.id} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3" data-testid="ranking-row">
              <span className="row-span-2 text-center text-xl font-extrabold tabular-nums" aria-label={t("rank", { n: p.rank })}>
                {p.score > 0 && p.rank <= 3 ? MEDALS[p.rank - 1] : p.rank}
              </span>
              <span className="min-w-0 truncate font-semibold">
                {p.name} <span className="font-mono text-xs font-normal text-muted-foreground">{p.staffNo}</span>
                <span className="block truncate text-xs font-normal text-muted-foreground">{roleOf(p)}</span>
              </span>
              <span className="text-right">
                <span className="block text-lg font-extrabold tabular-nums" data-testid="ranking-score">
                  {p.score}
                </span>
                <span className="text-xs text-muted-foreground">{t("points")}</span>
              </span>
              <div className="col-span-2 flex flex-col gap-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((p.score / top) * 100)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {[
                    p.served && t("served", { n: p.served }),
                    p.confirmed && t("confirmed", { n: p.confirmed }),
                    p.prepared && t("prepared", { n: p.prepared }),
                    p.taken && t("taken", { n: p.taken }),
                    p.minutes && t("hours", { h: hours(p.minutes) }),
                    p.days && t("days", { n: p.days }),
                    p.appActions && t("appActions", { n: p.appActions }),
                  ]
                    .filter(Boolean)
                    .join(" · ") || t("noActivity")}
                  {" · "}
                  <span className={p.lastSeenAt && now - p.lastSeenAt.getTime() < 600_000 ? "font-semibold text-emerald-700" : ""}>{seen(p.lastSeenAt)}</span>
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
        {t("how", { served: SCORE_WEIGHTS.served, handled: SCORE_WEIGHTS.confirmed, hour: SCORE_WEIGHTS.hour, day: SCORE_WEIGHTS.day, cap: APP_ACTIONS_CAP })}
      </p>
    </Card>
  );
}

/** Recent activity in words (« Plat modifié », « Commande servie »…), not codes. */
export async function ActivityFeed({ items }: { items: { id: string; action: string; createdAt: Date }[] }) {
  const t = await getTranslations("backoffice.activity");
  const format = await getFormatter();
  const label = (action: string) => {
    const key = `actions.${action.replace(/\./g, "_")}`;
    return t.has(key) ? t(key) : action;
  };
  return (
    <Card data-testid="activity">
      <CardTitle className="mb-3">{t("title")}</CardTitle>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {items.map((a) => (
            <li key={a.id} className="flex justify-between gap-3 py-2">
              <span>{label(a.action)}</span>
              <time className="shrink-0 text-muted-foreground" dateTime={a.createdAt.toISOString()}>
                {format.dateTime(a.createdAt, { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Ouagadougou" })}
              </time>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
