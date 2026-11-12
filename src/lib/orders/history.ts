import "server-only";
import { parseOrderCode } from "./code";
import { and, desc, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { orders } from "@/db/schema";
import { rangeStart, type Range } from "@/lib/analytics/orders";

export const HISTORY_STATUSES = ["open", "served", "paid", "cancelled"] as const;

export const HistoryFilter = z.object({
  range: z.enum(["today", "7d", "30d"]).catch("today"),
  status: z.enum(["all", ...HISTORY_STATUSES]).catch("all"),
  /** Order number (« 27 ») or seat label (« Table 4 », « Salon Ouaga »). */
  q: z.string().trim().max(40).catch(""),
  staff: z.uuid().optional().catch(undefined),
});
export type HistoryFilter = z.infer<typeof HistoryFilter>;

const STATUS_SETS: Record<(typeof HISTORY_STATUSES)[number], ("sent" | "confirmed" | "preparing" | "ready" | "served" | "paid" | "cancelled")[]> = {
  open: ["sent", "confirmed", "preparing", "ready"],
  served: ["served"],
  paid: ["paid"],
  cancelled: ["cancelled"],
};

/** Orders of one restaurant for the back office, newest first (at most `limit`). */
export async function orderHistory(db: DB, restaurantId: string, f: HistoryFilter, limit = 300, now = new Date()) {
  // A full order number (« SL-261112-007 ») finds that order whatever the period.
  const code = f.q ? parseOrderCode(f.q) : null;
  const where: SQL[] = [eq(orders.restaurantId, restaurantId)];
  if (code) where.push(eq(orders.businessDate, code.businessDate), eq(orders.number, code.number));
  else where.push(gte(orders.sentAt, rangeStart(f.range as Range, now)));
  if (f.status !== "all") where.push(inArray(orders.status, STATUS_SETS[f.status]));
  if (f.q && !code) {
    const num = /^#?\d{1,5}$/.test(f.q) ? Number(f.q.replace("#", "")) : null;
    const like = `%${f.q.replace(/[%_\\]/g, "\\$&")}%`;
    where.push(num !== null ? eq(orders.number, num) : sql`(${orders.seatLabel} ilike ${like} or ${orders.customerName} ilike ${like} or ${orders.customerPhone} ilike ${like} or ${orders.code} ilike ${like})`);
  }
  if (f.staff) {
    const s = f.staff;
    where.push(sql`(${orders.takenBy} = ${s} or ${orders.confirmedBy} = ${s} or ${orders.preparedBy} = ${s} or ${orders.servedBy} = ${s} or ${orders.cancelledBy} = ${s})`);
  }
  const rows = await db
    .select({
      id: orders.id,
      number: orders.number,
      code: orders.code,
      businessDate: orders.businessDate,
      status: orders.status,
      source: orders.source,
      seatType: orders.seatType,
      seatLabel: orders.seatLabel,
      customerName: orders.customerName,
      subtotal: orders.subtotal,
      hasOnRequest: orders.hasOnRequest,
      sentAt: orders.sentAt,
      servedAt: orders.servedAt,
      cancelledReason: orders.cancelledReason,
      takenBy: orders.takenBy,
      confirmedBy: orders.confirmedBy,
      preparedBy: orders.preparedBy,
      servedBy: orders.servedBy,
      cancelledBy: orders.cancelledBy,
      items: sql<number>`(select coalesce(sum(i.qty), 0)::int from order_items i where i.order_id = ${orders.id} and i.status <> 'cancelled')`,
    })
    .from(orders)
    .where(and(...where))
    .orderBy(desc(orders.sentAt))
    .limit(limit);
  const total = rows.filter((r) => r.status === "served" || r.status === "paid").reduce((s, r) => s + r.subtotal, 0);
  return { rows, total, truncated: rows.length === limit };
}

export type HistoryRow = Awaited<ReturnType<typeof orderHistory>>["rows"][number];

/** One CSV cell (RFC 4180), also neutralising spreadsheet formulas. */
export function csvCell(v: string | number | null | undefined): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
