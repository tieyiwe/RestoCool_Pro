import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { orderItems, orders, seats, tableSessions, type restaurants } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { assigneeFor } from "@/lib/assignments/route";
import { NotFoundError } from "@/lib/errors";
import { hasFeature } from "@/lib/plan";
import { promoPrices } from "@/lib/promotions";
import { notify } from "@/lib/realtime/events";
import { openTripOfBus } from "@/lib/transport/trips";
import { businessInitials, orderCode } from "./code";
import { actorTag, businessDate, memberIdOf, need, OrderError, OrderLineInput, priceLines, type ServiceCtx } from "./service";

type Restaurant = typeof restaurants.$inferSelect;

/**
 * « Prendre une commande »: a server enters an order for a customer (no smartphone, a regular
 * who just tells them). Same pricing as customers (server side), the seat comes from the server's
 * choice, and the order is confirmed by the one who took it (they just heard the customer).
 */
export const StaffOrderInput = z.object({
  seatId: z.uuid(),
  lines: z.array(OrderLineInput).min(1).max(50),
  customerName: z.string().trim().min(1).max(40).optional(),
  customerPhone: z.string().trim().regex(/^\+?[0-9 ]{8,16}$/).optional(),
  deliveryAddress: z.string().trim().min(3).max(200).optional(),
  pickupTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  note: z.string().trim().max(200).optional(),
  /** Idempotency key from the screen (a resend after a lost answer returns the same order). */
  requestId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
});
export type StaffOrderInput = z.infer<typeof StaffOrderInput>;

export async function placeStaffOrder(ctx: ServiceCtx, r: Restaurant, input: StaffOrderInput, now = new Date()) {
  need(ctx, "orders.create");
  const rid = ctx.repo.restaurantId;
  if (r.id !== rid) throw new NotFoundError();
  const taker = await memberIdOf(ctx);
  const deviceTag = `staff:${taker ?? "unknown"}`;
  const again = await ctx.db.query.orders.findFirst({ where: and(eq(orders.restaurantId, rid), eq(orders.clientRequestId, input.requestId)) });
  if (again) return again;

  const seat = await ctx.db.query.seats.findFirst({ where: and(eq(seats.restaurantId, rid), eq(seats.id, input.seatId), eq(seats.active, true)) });
  if (!seat) throw new OrderError("no_seat");
  const type = seat.type;
  if (type === "takeaway" && !input.customerName) throw new OrderError("takeaway_required");
  if (type === "delivery" && (!input.customerName || !input.customerPhone || !input.deliveryAddress)) throw new OrderError("delivery_required");
  let tripId: string | null = null;
  if (type === "seat") {
    const trip = seat.busId ? await openTripOfBus(ctx.db, seat.busId) : null;
    if (!trip) throw new OrderError("no_trip");
    tripId = trip.id;
  }
  const promos = hasFeature(r, "promotions", now) ? await promoPrices(ctx.db, rid, input.lines.map((l) => l.itemId)) : new Map<string, number>();
  const priced = await priceLines(ctx.db, rid, input.lines, now, promos);
  const assignee = (await assigneeFor(ctx.db, rid, { id: seat.id, areaId: seat.areaId }, now)) ?? taker;

  return ctx.db.transaction(async (tx) => {
    // The seat's open session (the table's bill), or a new one opened by this server.
    let session = await tx.query.tableSessions.findFirst({ where: and(eq(tableSessions.restaurantId, rid), eq(tableSessions.seatId, seat.id), eq(tableSessions.status, "open")) });
    if (!session) {
      [session] = await tx
        .insert(tableSessions)
        .values({ restaurantId: rid, seatId: seat.id, source: "staff", openedByDevice: deviceTag, openedAt: now, lastActivityAt: now })
        .onConflictDoNothing()
        .returning();
      session ??= await tx.query.tableSessions.findFirst({ where: and(eq(tableSessions.restaurantId, rid), eq(tableSessions.seatId, seat.id), eq(tableSessions.status, "open")) });
    } else {
      await tx.update(tableSessions).set({ lastActivityAt: now }).where(eq(tableSessions.id, session.id));
    }
    const day = businessDate(now);
    await tx.execute(sqlLock(rid));
    const number = await nextNumberTx(tx, rid, day);
    const [o] = await tx
      .insert(orders)
      .values({
        restaurantId: rid,
        sessionId: session?.id ?? null,
        seatId: seat.id,
        seatType: type,
        seatLabel: seat.label,
        tripId,
        businessDate: day,
        number,
        code: orderCode(businessInitials(r.name), day, number),
        source: "staff",
        customerDeviceId: null,
        clientRequestId: input.requestId,
        customerName: input.customerName ?? null,
        customerPhone: input.customerPhone ?? null,
        deliveryAddress: type === "delivery" ? (input.deliveryAddress ?? null) : null,
        pickupTime: type === "takeaway" ? (input.pickupTime ?? null) : null,
        // The server heard the customer: confirmed at once, straight to the kitchen.
        status: "confirmed",
        validationMode: r.settings.orderValidation ?? "server_confirms",
        assignedStaffId: assignee,
        subtotal: priced.subtotal,
        hasOnRequest: priced.hasOnRequest,
        note: input.note || null,
        sentAt: now,
        confirmedAt: now,
        takenBy: taker,
        confirmedBy: taker,
        updatedBy: actorTag(ctx.actor),
      })
      .returning();
    await tx.insert(orderItems).values(priced.lines.map((l, i) => ({ ...l, restaurantId: rid, orderId: o!.id, sort: i })));
    await writeAudit(tx, ctx.actor, { restaurantId: rid, action: "order.taken", entity: "order", entityId: o!.id, data: { number, seat: seat.label, lines: priced.lines.length, subtotal: priced.subtotal } });
    await notify(tx, { k: "order", r: rid, o: o!.id, s: session?.id ?? null, d: null });
    return o!;
  });
}

const sqlLock = (rid: string) => sql`select pg_advisory_xact_lock(hashtext(${`orders:${rid}`}))`;
async function nextNumberTx(tx: { execute: ServiceCtx["db"]["execute"] }, rid: string, day: string) {
  const res = await tx.execute<{ n: number }>(sql`select coalesce(max(number), 0)::int + 1 as n from orders where restaurant_id = ${rid} and business_date = ${day}`);
  return res.rows[0]!.n;
}
