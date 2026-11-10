import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db";
import { requireMemberPage } from "@/lib/auth/page";
import { formatFCFA } from "@/lib/format";
import { HISTORY_STATUSES, HistoryFilter, orderHistory } from "@/lib/orders/history";
import { formatStaffNo, personLookup, personnel } from "@/lib/personnel";

export const dynamic = "force-dynamic";

const field = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base";
const TZ = "Africa/Ouagadougou";
const STATUS_TONE: Record<string, string> = {
  sent: "bg-or/20 text-foreground",
  confirmed: "bg-sky-100 text-sky-900",
  preparing: "bg-amber-100 text-amber-900",
  ready: "bg-emerald-100 text-emerald-900",
  served: "bg-primary/15 text-primary",
  paid: "bg-primary text-primary-foreground",
  cancelled: "bg-red-100 text-red-900",
};

/** « Historique des commandes »: every order, filterable, with who handled it, exportable as CSV. */
export default async function OrderHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireMemberPage("reports.read");
  const t = await getTranslations("backoffice.history");
  const ts = await getTranslations("service.status");
  const format = await getFormatter();
  const f = HistoryFilter.parse(await searchParams);
  const db = getDb();
  const rid = ctx.repo.restaurantId;
  const [{ rows, total, truncated }, people] = await Promise.all([orderHistory(db, rid, f), personnel(db, rid)]);
  const who = personLookup(people);
  const query = new URLSearchParams(Object.entries({ range: f.range, status: f.status, q: f.q, staff: f.staff ?? "" }).filter(([, v]) => v)).toString();
  const time = (d: Date) => format.dateTime(d, { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const day = (d: Date) => format.dateTime(d, { weekday: "short", day: "numeric", month: "short", timeZone: TZ });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("intro")}</p>
        </div>
        <Button asChild variant="outline">
          <a href={`/api/app/orders/export?${query}`} download data-testid="history-export">
            ⬇️ {t("export")}
          </a>
        </Button>
      </div>

      <Card>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end" data-testid="history-filters">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("range")}</span>
            <select name="range" defaultValue={f.range} className={field}>
              {(["today", "7d", "30d"] as const).map((r) => (
                <option key={r} value={r}>
                  {t(`ranges.${r}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("status")}</span>
            <select name="status" defaultValue={f.status} className={field}>
              <option value="all">{t("all")}</option>
              {HISTORY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`statuses.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("person")}</span>
            <select name="staff" defaultValue={f.staff ?? ""} className={field}>
              <option value="">{t("everyone")}</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {formatStaffNo(p.staffNo)} · {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("search")}</span>
            <input name="q" defaultValue={f.q} placeholder={t("searchPlaceholder")} className={field} />
          </label>
          <Button type="submit">{t("filter")}</Button>
        </form>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-muted-foreground">{t("count")}</p>
          <p className="text-2xl font-extrabold tabular-nums" data-testid="history-count">
            {rows.length}
            {truncated ? "+" : ""}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">{t("total")}</p>
          <p className="text-2xl font-extrabold tabular-nums">{formatFCFA(total) ?? "0 F"}</p>
        </Card>
      </div>

      {rows.length === 0 ? (
        <Card className="text-center text-muted-foreground" data-testid="history-empty">
          {t("empty")}
        </Card>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="history-list">
          {rows.map((o) => {
            const handled = [
              ["taken", o.takenBy],
              ["confirmed", o.confirmedBy],
              ["prepared", o.preparedBy],
              ["served", o.servedBy],
              ["cancelled", o.cancelledBy],
            ]
              .map(([k, id]) => [k, who(id as string | null)] as const)
              .filter(([, p]) => p);
            return (
              <li key={o.id}>
                <Link
                  href={`/app/orders/${o.id}`}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-surface p-3 hover:bg-muted/50"
                  data-testid="history-row"
                >
                  <span className="row-span-2 flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-lg font-extrabold tabular-nums">{o.number}</span>
                  <span className="min-w-0 truncate font-semibold">
                    {o.seatLabel ?? o.customerName ?? "—"}
                    <span className="font-normal text-muted-foreground"> · {t("items", { n: o.items })}</span>
                  </span>
                  <span className="text-right font-bold tabular-nums">{o.hasOnRequest && !o.subtotal ? t("onRequest") : formatFCFA(o.subtotal)}</span>
                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                    {day(o.sentAt)} · {time(o.sentAt)}
                    {handled.map(([k, p]) => ` · ${t(`by.${k}`)} ${p!.name} (${p!.staffNo})`).join("")}
                    {o.cancelledReason ? ` · ${o.cancelledReason}` : ""}
                  </span>
                  <span className={`justify-self-end rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[o.status] ?? ""}`}>{ts(o.status)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {truncated && <p className="text-sm text-muted-foreground">{t("truncated")}</p>}
    </div>
  );
}
