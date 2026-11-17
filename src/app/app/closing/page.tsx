import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { PrintButton } from "@/components/print-button";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db";
import { requireMemberPage } from "@/lib/auth/page";
import { dailyClosing } from "@/lib/billing";
import { formatFCFA } from "@/lib/format";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("cashier"))("closingTitle") };
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** « Clôture de caisse »: the day's money by method, person and category; bills, discounts, cancellations. */
export default async function ClosingPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const ctx = await requireMemberPage("reports.read");
  const sp = await searchParams;
  const todayStr = new Date().toISOString().slice(0, 10);
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) && sp.day <= todayStr ? sp.day : todayStr;
  const [t, format] = await Promise.all([getTranslations("cashier"), getFormatter()]);
  const c = await dailyClosing({ db: getDb(), actor: ctx.actor, repo: ctx.repo }, day);
  const r = await ctx.repo.restaurant.get();
  const F = (n: number) => formatFCFA(n) ?? "0 F";
  const who = (name: string | null, no: number | null) => (name ? `${name}${no ? ` · ${String(no).padStart(3, "0")}` : ""}` : t("unknownStaff"));
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4" data-testid="closing-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">📊 {t("closingTitle")}</h1>
          <p className="text-muted-foreground first-letter:uppercase">
            {r?.name} · {format.dateTime(new Date(`${day}T00:00:00Z`), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Link href={`/app/closing?day=${addDays(day, -1)}`} className="inline-flex min-h-11 items-center rounded-xl border border-border px-3 font-semibold" aria-label={t("prevDay")}>
            ←
          </Link>
          {day < todayStr && (
            <Link href={`/app/closing?day=${addDays(day, 1)}`} className="inline-flex min-h-11 items-center rounded-xl border border-border px-3 font-semibold" aria-label={t("nextDay")}>
              →
            </Link>
          )}
          <a href={`/api/app/closing/export?day=${day}`} className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 font-bold" data-testid="closing-csv">
            ⬇️ CSV
          </a>
          <PrintButton label={t("printPdf")} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["total", F(c.total)],
            ["cashInDrawer", F(c.cash)],
            ["billsCount", String(c.bills.n)],
            ["averageTicket", F(c.bills.average)],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-border bg-surface p-4" data-testid={`closing-${k}`}>
            <p className="text-xs font-semibold text-muted-foreground">{t(`closing.${k}`)}</p>
            <p className="text-2xl font-extrabold tabular-nums">{v}</p>
          </div>
        ))}
      </div>

      <Card>
        <h2 className="mb-2 font-extrabold">{t("closing.byMethod")}</h2>
        {c.byMethod.length === 0 ? (
          <p className="text-muted-foreground">{t("closing.none")}</p>
        ) : (
          <table className="w-full text-sm" data-testid="closing-methods">
            <tbody>
              {c.byMethod.map((m) => (
                <tr key={m.method} className="border-b border-border last:border-0">
                  <td className="py-2 font-semibold">{t(`methods.${m.method}`)}</td>
                  <td className="py-2 text-muted-foreground">{t("closing.payments", { n: m.n })}</td>
                  <td className="py-2 text-right font-bold tabular-nums">{F(m.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-extrabold">{t("closing.byStaff")}</h2>
          <ul className="text-sm">
            {c.byStaff.map((s) => (
              <li key={s.staffId ?? "none"} className="flex justify-between gap-2 border-b border-border py-2 last:border-0">
                <span>{who(s.name, s.staffNo)}</span>
                <span className="font-bold tabular-nums">{F(s.amount)}</span>
              </li>
            ))}
            {c.byStaff.length === 0 && <li className="text-muted-foreground">{t("closing.none")}</li>}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 font-extrabold">{t("closing.byCategory")}</h2>
          <ul className="text-sm">
            {c.byCategory.map((k) => (
              <li key={k.category ?? "-"} className="flex justify-between gap-2 border-b border-border py-2 last:border-0">
                <span>
                  {k.category ?? t("closing.other")} <span className="text-muted-foreground">× {k.qty}</span>
                </span>
                <span className="font-bold tabular-nums">{F(k.amount)}</span>
              </li>
            ))}
            {c.byCategory.length === 0 && <li className="text-muted-foreground">{t("closing.none")}</li>}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-extrabold">
            {t("closing.discounts")} · {F(c.discounts.total)}
          </h2>
          <ul className="text-sm" data-testid="closing-discounts">
            {c.discounts.list.map((d, i) => (
              <li key={i} className="border-b border-border py-2 last:border-0">
                <b className="tabular-nums">− {F(d.amount)}</b> · {d.seat ?? ""} · « {d.reason} » · {who(d.by, d.staffNo)}
              </li>
            ))}
            {c.discounts.list.length === 0 && <li className="text-muted-foreground">{t("closing.none")}</li>}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 font-extrabold">
            {t("closing.cancelled")} · {c.cancelled.n} ({F(c.cancelled.amount)})
          </h2>
          <ul className="text-sm" data-testid="closing-cancelled">
            {c.cancelled.list.map((o, i) => (
              <li key={i} className="border-b border-border py-2 last:border-0">
                {o.code ?? `n° ${o.number}`} · {F(o.amount)} · {o.reason === "system:unhandled" ? t("closing.unhandled") : `« ${o.reason ?? ""} »`}
                {o.by ? ` · ${who(o.by, o.staffNo)}` : ""}
              </li>
            ))}
            {c.cancelled.list.length === 0 && <li className="text-muted-foreground">{t("closing.none")}</li>}
          </ul>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground">{t("closing.note")}</p>
    </div>
  );
}
