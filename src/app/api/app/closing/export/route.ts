import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/db";
import { requireMember } from "@/lib/auth/context";
import { dailyClosing } from "@/lib/billing";
import { handle } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Cells Excel would run as a formula are prefixed with a quote. */
const cell = (v: unknown) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV of the day's closing (UTF-8 with BOM, « ; » separator for French Excel). */
export const GET = handle(async (req: Request) => {
  const m = await requireMember("reports.read");
  const raw = new URL(req.url).searchParams.get("day") ?? "";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 10);
  const t = await getTranslations("cashier");
  const c = await dailyClosing({ db: getDb(), actor: m.actor, repo: m.repo }, day);
  const rows: unknown[][] = [
    [t("closingTitle"), day],
    [],
    [t("closing.total"), c.total],
    [t("closing.cashInDrawer"), c.cash],
    [t("closing.billsCount"), c.bills.n],
    [t("closing.averageTicket"), c.bills.average],
    [],
    [t("closing.byMethod"), t("closing.count"), t("closing.amount")],
    ...c.byMethod.map((x) => [t(`methods.${x.method}`), x.n, x.amount]),
    [],
    [t("closing.byStaff"), t("closing.count"), t("closing.amount")],
    ...c.byStaff.map((x) => [x.name ?? "-", x.n, x.amount]),
    [],
    [t("closing.byCategory"), t("closing.qty"), t("closing.amount")],
    ...c.byCategory.map((x) => [x.category ?? "-", x.qty, x.amount]),
    [],
    [t("closing.discounts"), t("closing.amount"), t("discountReason")],
    ...c.discounts.list.map((x) => [x.seat ?? "-", x.amount, x.reason ?? ""]),
    [],
    [t("closing.cancelled"), t("closing.amount"), t("closing.reason")],
    ...c.cancelled.list.map((x) => [x.code ?? x.number, x.amount, x.reason === "system:unhandled" ? t("closing.unhandled") : (x.reason ?? "")]),
  ];
  const csv = "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="cloture-${day}.csv"`, "Cache-Control": "no-store" },
  });
});
