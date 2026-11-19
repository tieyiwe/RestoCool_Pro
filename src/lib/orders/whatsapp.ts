import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { orderItems, orders, seats, type restaurants } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/can";
import { hasFeature } from "@/lib/plan";
import { promoPrices } from "@/lib/promotions";
import { notify } from "@/lib/realtime/events";
import { businessInitials, orderCode } from "./code";
import { businessDate, OrderError, OrderLineInput, priceLines } from "./service";

type Restaurant = typeof restaurants.$inferSelect;

/**
 * « Commander à emporter par WhatsApp »: the customer's message still goes to the business's
 * WhatsApp, and the same order is recorded on RestoCool (`channel: whatsapp`), so it appears on
 * the dashboard (every plan) and the service board (plans with live service). The business marks
 * it ready, handed over (« Remise au client ») or cancelled. Prices come from the server.
 */
export const WhatsappOrderInput = z.object({
  lines: z.array(OrderLineInput).min(1).max(50),
  customerName: z.string().trim().min(1).max(40),
  customerPhone: z.string().trim().regex(/^\+?[0-9 ]{8,16}$/).optional(),
  pickupTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  requestId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
});

export function whatsappTakeawayOn(r: Restaurant): boolean {
  const f = (r.settings as { features?: { takeawayWhatsapp?: boolean } }).features ?? {};
  return (f.takeawayWhatsapp ?? true) && Boolean((r.settings as { takeawayWhatsapp?: string | null }).takeawayWhatsapp ?? r.whatsapp);
}

export async function placeWhatsappOrder(db: DB, r: Restaurant, deviceId: string, input: z.infer<typeof WhatsappOrderInput>, now = new Date()) {
  if (!whatsappTakeawayOn(r)) throw new OrderError("invalid");
  const again = await db.query.orders.findFirst({ where: and(eq(orders.restaurantId, r.id), eq(orders.clientRequestId, input.requestId), eq(orders.customerDeviceId, deviceId)) });
  if (again) return again;
  const promos = hasFeature(r, "promotions", now) ? await promoPrices(db, r.id, input.lines.map((l) => l.itemId)) : new Map<string, number>();
  const priced = await priceLines(db, r.id, input.lines, now, promos);
  // The business's takeaway place, when it has one (else the order is simply « À emporter »).
  const [seat] = await db
    .select({ id: seats.id, label: seats.label })
    .from(seats)
    .where(and(eq(seats.restaurantId, r.id), eq(seats.type, "takeaway"), eq(seats.active, true), isNull(seats.busId)))
    .limit(1);
  const actor: Actor = { kind: "customer", deviceId, restaurantId: r.id };
  return db.transaction(async (tx) => {
    const day = businessDate(now);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`orders:${r.id}`}))`);
    const res = await tx.execute<{ n: number }>(sql`select coalesce(max(number), 0)::int + 1 as n from orders where restaurant_id = ${r.id} and business_date = ${day}`);
    const number = res.rows[0]!.n;
    const [o] = await tx
      .insert(orders)
      .values({
        restaurantId: r.id,
        sessionId: null,
        seatId: seat?.id ?? null,
        seatType: "takeaway",
        seatLabel: seat?.label ?? "À emporter",
        businessDate: day,
        number,
        code: orderCode(businessInitials(r.name), day, number),
        source: "customer",
        channel: "whatsapp",
        customerDeviceId: deviceId,
        clientRequestId: input.requestId,
        customerName: input.customerName,
        customerPhone: input.customerPhone ?? null,
        pickupTime: input.pickupTime ?? null,
        status: "sent",
        validationMode: "server_confirms",
        subtotal: priced.subtotal,
        hasOnRequest: priced.hasOnRequest,
        sentAt: now,
        updatedBy: "customer",
      })
      .returning();
    await tx.insert(orderItems).values(priced.lines.map((l, i) => ({ ...l, restaurantId: r.id, orderId: o!.id, sort: i })));
    await writeAudit(tx, actor, { restaurantId: r.id, action: "order.whatsapp", entity: "order", entityId: o!.id, data: { number, lines: priced.lines.length, subtotal: priced.subtotal } });
    await notify(tx, { k: "order", r: r.id, o: o!.id, s: null, d: deviceId });
    return o!;
  });
}

/** WhatsApp takeaway orders still to handle, and those finished today (dashboard card). */
export async function whatsappOrders(db: DB, restaurantId: string, now = new Date()) {
  const since = new Date(now.getTime() - 48 * 3600_000);
  const list = await db
    .select()
    .from(orders)
    .where(and(eq(orders.restaurantId, restaurantId), eq(orders.channel, "whatsapp"), sql`${orders.sentAt} >= ${since}`))
    .orderBy(orders.sentAt)
    .limit(100);
  const open = list.filter((o) => ["sent", "confirmed", "preparing", "ready"].includes(o.status));
  const items = open.length
    ? await db.select().from(orderItems).where(and(eq(orderItems.restaurantId, restaurantId), inArray(orderItems.orderId, open.map((o) => o.id)))).orderBy(orderItems.sort)
    : [];
  const today = businessDate(now);
  return {
    open: open.map((o) => ({
      id: o.id,
      number: o.number,
      code: o.code,
      status: o.status,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      pickupTime: o.pickupTime,
      subtotal: o.subtotal,
      hasOnRequest: o.hasOnRequest,
      sentAt: o.sentAt.toISOString(),
      items: items.filter((i) => i.orderId === o.id).map((i) => ({ qty: i.qty, code: i.code, name: i.nameSnapshot.fr, variant: i.variantName?.fr ?? null, note: i.note })),
    })),
    doneToday: list.filter((o) => o.businessDate === today && (o.status === "served" || o.status === "paid")).length,
    cancelledToday: list.filter((o) => o.businessDate === today && o.status === "cancelled").length,
  };
}
