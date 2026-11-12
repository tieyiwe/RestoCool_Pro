import { getTranslations } from "next-intl/server";
import { getDb } from "@/db";
import { requireMember } from "@/lib/auth/context";
import { handle } from "@/lib/http";
import { HistoryFilter, csvCell, orderHistory } from "@/lib/orders/history";
import { personLookup, personnel } from "@/lib/personnel";

export const dynamic = "force-dynamic";

/** Order history as CSV (opens in Excel / Google Sheets), same filters as the page. Leads only. */
export const GET = handle(async (req: Request) => {
  const ctx = await requireMember("reports.read");
  const url = new URL(req.url);
  const f = HistoryFilter.parse(Object.fromEntries(url.searchParams));
  const db = getDb();
  const rid = ctx.repo.restaurantId;
  const [{ rows }, people] = await Promise.all([orderHistory(db, rid, f, 5000), personnel(db, rid)]);
  const who = personLookup(people);
  const t = await getTranslations("backoffice.csv");
  const ts = await getTranslations("service.status");
  const name = (id: string | null) => {
    const p = who(id);
    return p ? `${p.name} (${p.staffNo})` : "";
  };
  const head = ["date", "time", "code", "number", "status", "seat", "customer", "items", "total", "taken", "confirmed", "prepared", "served", "cancelled", "reason"].map((k) => t(k));
  const lines = rows.map((r) => {
    const iso = r.sentAt.toISOString();
    return [r.businessDate, iso.slice(11, 16), r.code ?? "", r.number, ts(r.status), r.seatLabel ?? "", r.customerName ?? "", r.items, r.subtotal, name(r.takenBy), name(r.confirmedBy), name(r.preparedBy), name(r.servedBy), name(r.cancelledBy), r.cancelledReason ?? ""]
      .map(csvCell)
      .join(",");
  });
  // BOM so Excel reads the accents (é, à) correctly.
  const body = "﻿" + [head.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n";
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="commandes-${f.range}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
});
