import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { and, eq, sql } from "drizzle-orm";
import { LiveRefresh } from "@/components/app-shell/live-refresh";
import { getDb } from "@/db";
import { payments } from "@/db/schema";
import { can } from "@/lib/auth/can";
import { requireMemberPage } from "@/lib/auth/page";
import { toCollect } from "@/lib/billing";
import { formatFCFA } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("cashier"))("title") };
}

/** « Caisse »: what is left to collect (tables and single orders), and today's takings. */
export default async function CashierPage() {
  const ctx = await requireMemberPage("orders.pay");
  const [t, format] = await Promise.all([getTranslations("cashier"), getFormatter()]);
  const svc = { db: getDb(), actor: ctx.actor, repo: ctx.repo };
  const groups = await toCollect(svc);
  const day = new Date().toISOString().slice(0, 10);
  const [today] = await getDb()
    .select({ total: sql<number>`coalesce(sum(${payments.amount}), 0)::int`, n: sql<number>`count(*)::int` })
    .from(payments)
    .where(and(eq(payments.restaurantId, ctx.repo.restaurantId), eq(payments.businessDate, day)));
  const canClose = can(ctx.actor, "reports.read", { restaurantId: ctx.repo.restaurantId });
  const F = (n: number) => formatFCFA(n) ?? "0 F";
  const seat = (g: (typeof groups)[number]) =>
    g.seatType === "table" ? t("table", { label: g.seatLabel ?? "" }) : g.seatType === "room" ? t("room", { label: g.seatLabel ?? "" }) : (g.seatLabel ?? t("order"));
  return (
    <div className="flex flex-col gap-5" data-testid="cashier-page">
      <LiveRefresh events={["order", "session"]} every={20_000} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">💰 {t("title")}</h1>
          <p className="text-muted-foreground">{t("intro")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-900" data-testid="cashier-today">
            {t("today", { amount: F(today?.total ?? 0), n: today?.n ?? 0 })}
          </span>
          {canClose && (
            <Link href="/app/closing" className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-bold" data-testid="cashier-closing">
              📊 {t("closingLink")}
            </Link>
          )}
        </div>
      </div>
      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground" data-testid="cashier-empty">
          {t("nothingToCollect")}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <li key={g.key} className={cn("flex flex-col gap-2 rounded-2xl border-2 bg-surface p-4", g.served ? "border-emerald-400" : "border-border")} data-testid="cashier-bill">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xl font-extrabold">{seat(g)}</p>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", g.served ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-950")}>{g.served ? t("allServed") : t("notAllServed")}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("ordersCount", { n: g.orders.length })} · {format.dateTime(g.since, { hour: "2-digit", minute: "2-digit" })}
                {g.orders[0]?.customerName ? ` · ${g.orders[0].customerName}` : ""}
              </p>
              <p className="text-2xl font-extrabold tabular-nums">{F(g.total)}{g.orders.some((o) => o.hasOnRequest) ? " +" : ""}</p>
              <Link
                href={g.sessionId ? `/app/pay?session=${g.sessionId}` : `/app/pay?order=${g.orderId}`}
                className="mt-auto flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 font-bold text-white"
                data-testid="cashier-collect"
              >
                💰 {t("collectShort")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
