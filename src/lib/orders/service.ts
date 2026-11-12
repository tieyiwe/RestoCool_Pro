import "server-only";
import { businessInitials, orderCode } from "./code";
import { and, asc, desc, eq, gt, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import {
  menuCategories,
  menuItemOptions,
  menuItems,
  menuItemVariants,
  members,
  orderItems,
  orders,
  restaurants,
  seats,
  sessionDevices,
  tableSessions,
  type OrderOptionSnapshot,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import type { Action, Actor } from "@/lib/auth/can";
import { can } from "@/lib/auth/can";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { notify } from "@/lib/realtime/events";
import type { TenantRepo } from "@/db/repos/tenant";

type Restaurant = typeof restaurants.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type OrderStatus = Order["status"];
export type ItemStatus = OrderItem["status"];

export class OrderError extends Error {
  constructor(
    public readonly code: "no_seat" | "name_required" | "delivery_required" | "takeaway_required" | "unavailable" | "empty" | "conflict" | "invalid" | "reason_required" | "no_trip",
    public readonly itemIds: string[] = [],
  ) {
    super(code);
  }
}

import { GROUP_SEATS } from "@/lib/seating/group-seats";
import { openTripOfBus } from "@/lib/transport/trips";
export { GROUP_SEATS };
/** Orders still being handled (the front desk and kitchen show these). */
export const ACTIVE_STATUSES = ["sent", "confirmed", "preparing", "ready"] as const satisfies readonly OrderStatus[];

/* ---------------------------------------------------------------- input */

export const OrderLineInput = z.object({
  itemId: z.uuid(),
  variantId: z.uuid().nullable(),
  optionIds: z.array(z.uuid()).max(10),
  qty: z.number().int().min(1).max(50),
  note: z.string().trim().max(140).optional(),
});
export const CustomerOrderInput = z.object({
  sessionId: z.uuid(),
  lines: z.array(OrderLineInput).min(1).max(50),
  customerName: z.string().trim().min(1).max(40).optional(),
  customerPhone: z.string().trim().regex(/^\+?[0-9 ]{8,16}$/).optional(),
  deliveryAddress: z.string().trim().min(3).max(200).optional(),
  pickupTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  note: z.string().trim().max(200).optional(),
  /** Idempotency key generated on the phone (same key = same order, never a duplicate). */
  requestId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/).optional(),
});
export type CustomerOrderInput = z.infer<typeof CustomerOrderInput>;

/** Africa/Ouagadougou is UTC all year: the business day is the UTC date. */
export const businessDate = (now: Date) => now.toISOString().slice(0, 10);

/* ---------------------------------------------------------------- pricing */

type PricedLine = {
  itemId: string;
  variantId: string | null;
  code: string | null;
  nameSnapshot: { fr: string; en?: string; zh?: string };
  variantName: { fr: string; en?: string; zh?: string } | null;
  options: OrderOptionSnapshot[];
  unitPrice: number | null;
  qty: number;
  note: string | null;
  station: OrderItem["station"];
};

/**
 * Prices every line from the database (never from the browser) and refuses dishes that are
 * hidden, sold out or from a hidden category. Variants/options must belong to the dish.
 */
export async function priceLines(db: DB, restaurantId: string, lines: z.infer<typeof OrderLineInput>[], now = new Date()): Promise<{ lines: PricedLine[]; subtotal: number; hasOnRequest: boolean }> {
  const ids = [...new Set(lines.map((l) => l.itemId))];
  const [items, variants, options] = await Promise.all([
    db
      .select({ item: menuItems, catActive: menuCategories.active })
      .from(menuItems)
      .innerJoin(menuCategories, eq(menuCategories.id, menuItems.categoryId))
      .where(and(eq(menuItems.restaurantId, restaurantId), inArray(menuItems.id, ids))),
    db.select().from(menuItemVariants).where(and(eq(menuItemVariants.restaurantId, restaurantId), inArray(menuItemVariants.itemId, ids))),
    db.select().from(menuItemOptions).where(and(eq(menuItemOptions.restaurantId, restaurantId), inArray(menuItemOptions.itemId, ids))),
  ]);
  const byId = new Map(items.map((x) => [x.item.id, x]));
  const unavailable: string[] = [];
  const priced: PricedLine[] = [];
  for (const l of lines) {
    const row = byId.get(l.itemId);
    const item = row?.item;
    const soldOut = item?.soldOutUntil ? item.soldOutUntil.getTime() > now.getTime() : false;
    if (!item || !item.available || !row.catActive || soldOut) {
      unavailable.push(l.itemId);
      continue;
    }
    const itemVariants = variants.filter((v) => v.itemId === item.id);
    const variant = l.variantId ? itemVariants.find((v) => v.id === l.variantId) : null;
    // A dish with variants needs one of its own; a dish without variants takes none.
    if ((itemVariants.length > 0 && !variant) || (l.variantId && !variant)) throw new OrderError("invalid");
    const opts = [...new Set(l.optionIds)].map((id) => options.find((o) => o.id === id && o.itemId === item.id));
    if (opts.some((o) => !o)) throw new OrderError("invalid");
    // Each option group allows at most `max_select` choices (1 by default), as on the menu.
    const perGroup = new Map<string, { count: number; max: number }>();
    for (const o of opts) {
      const key = JSON.stringify(o!.group);
      const g = perGroup.get(key) ?? { count: 0, max: 0 };
      g.count += 1;
      g.max = Math.max(g.max, o!.maxSelect || 1);
      perGroup.set(key, g);
    }
    if ([...perGroup.values()].some((g) => g.count > g.max)) throw new OrderError("invalid");
    const optionSnap = opts.map((o) => ({ id: o!.id, group: o!.group, name: o!.name, priceDelta: o!.priceDelta }));
    const base = variant ? variant.price : item.price;
    const unitPrice = base === null ? null : base + optionSnap.reduce((s, o) => s + o.priceDelta, 0);
    priced.push({
      itemId: item.id,
      variantId: variant?.id ?? null,
      code: item.code,
      nameSnapshot: item.name,
      variantName: variant?.name ?? null,
      options: optionSnap,
      unitPrice,
      qty: l.qty,
      note: l.note || null,
      station: item.station,
    });
  }
  if (unavailable.length) throw new OrderError("unavailable", unavailable);
  return {
    lines: priced,
    subtotal: priced.reduce((s, l) => s + (l.unitPrice ?? 0) * l.qty, 0),
    hasOnRequest: priced.some((l) => l.unitPrice === null),
  };
}

/* ---------------------------------------------------------------- customer orders */

/** The device's open session of this restaurant, with its seat. Null if the phone left or it closed. */
export async function customerSession(db: DB, restaurantId: string, sessionId: string, deviceId: string) {
  const [row] = await db
    .select({ session: tableSessions, seat: seats, device: sessionDevices })
    .from(sessionDevices)
    .innerJoin(tableSessions, eq(tableSessions.id, sessionDevices.sessionId))
    .innerJoin(seats, eq(seats.id, tableSessions.seatId))
    .where(
      and(
        eq(sessionDevices.restaurantId, restaurantId),
        eq(sessionDevices.sessionId, sessionId),
        eq(sessionDevices.deviceId, deviceId),
        isNull(sessionDevices.leftAt),
        eq(tableSessions.status, "open"),
      ),
    );
  return row ?? null;
}

async function nextNumber(tx: Pick<DB, "execute">, restaurantId: string, day: string): Promise<number> {
  // Serialise numbering per restaurant (the lock ends with the transaction).
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`orders:${restaurantId}`}))`);
  const res = await tx.execute<{ n: number }>(sql`select coalesce(max(number), 0)::int + 1 as n from orders where restaurant_id = ${restaurantId} and business_date = ${day}`);
  return res.rows[0]!.n;
}

/** A customer sends their selection. The seat comes from their session (QR or picker), never from the body. */
async function orderForRequest(db: DB, restaurantId: string, deviceId: string, requestId: string | undefined) {
  if (!requestId) return null;
  return (
    (await db.query.orders.findFirst({
      where: and(eq(orders.restaurantId, restaurantId), eq(orders.clientRequestId, requestId), eq(orders.customerDeviceId, deviceId)),
    })) ?? null
  );
}

export async function placeCustomerOrder(db: DB, r: Restaurant, deviceId: string, input: CustomerOrderInput, now = new Date()) {
  // Resent after a lost answer: give back the order already created, don't make a second one.
  const already = await orderForRequest(db, r.id, deviceId, input.requestId);
  if (already) return already;
  const s = await customerSession(db, r.id, input.sessionId, deviceId);
  if (!s) throw new OrderError("no_seat");
  const type = s.seat.type;
  const name = input.customerName ?? s.device.customerName ?? null;
  if (type === "counter" && !name) throw new OrderError("name_required");
  // Takeaway: the business must be able to call the customer back.
  if (type === "takeaway" && (!name || !input.customerPhone)) throw new OrderError("takeaway_required");
  if (type === "delivery" && (!name || !input.customerPhone || !input.deliveryAddress)) throw new OrderError("delivery_required");
  // On a bus, orders are taken during a trip only (the hostess starts it), and belong to it.
  let tripId: string | null = null;
  if (type === "seat") {
    const trip = s.seat.busId ? await openTripOfBus(db, s.seat.busId) : null;
    if (!trip) throw new OrderError("no_trip");
    tripId = trip.id;
  }

  const priced = await priceLines(db, r.id, input.lines, now);
  const mode = r.settings.orderValidation ?? "server_confirms";
  const actor: Actor = { kind: "customer", deviceId, restaurantId: r.id };

  const insert = () => db.transaction(async (tx) => {
    const day = businessDate(now);
    const number = await nextNumber(tx, r.id, day);
    const [o] = await tx
      .insert(orders)
      .values({
        restaurantId: r.id,
        sessionId: s.session.id,
        seatId: s.seat.id,
        seatType: type,
        seatLabel: s.seat.label,
        tripId,
        businessDate: day,
        number,
        code: orderCode(businessInitials(r.name), day, number),
        source: "customer",
        customerDeviceId: deviceId,
        clientRequestId: input.requestId ?? null,
        customerName: name,
        customerPhone: type === "delivery" || type === "takeaway" ? (input.customerPhone ?? null) : null,
        deliveryAddress: type === "delivery" ? (input.deliveryAddress ?? null) : null,
        pickupTime: type === "takeaway" ? (input.pickupTime ?? null) : null,
        // Direct mode: the order goes straight to the kitchen.
        status: mode === "direct" ? "confirmed" : "sent",
        validationMode: mode,
        subtotal: priced.subtotal,
        hasOnRequest: priced.hasOnRequest,
        note: input.note || null,
        sentAt: now,
        confirmedAt: mode === "direct" ? now : null,
        updatedBy: "customer",
      })
      .returning();
    await tx.insert(orderItems).values(priced.lines.map((l, i) => ({ ...l, restaurantId: r.id, orderId: o!.id, sort: i })));
    await tx.update(tableSessions).set({ lastActivityAt: now }).where(eq(tableSessions.id, s.session.id));
    await writeAudit(tx, actor, { restaurantId: r.id, action: "order.sent", entity: "order", entityId: o!.id, data: { number, lines: priced.lines.length, subtotal: priced.subtotal } });
    await notify(tx, { k: "order", r: r.id, o: o!.id, s: s.session.id, d: deviceId });
    return o!;
  });
  try {
    return await insert();
  } catch (err) {
    // Two copies of the same request at the same instant: the unique index let one win.
    const c = err as { code?: string; cause?: { code?: string } };
    if ((c.cause?.code ?? c.code) === "23505") {
      const winner = await orderForRequest(db, r.id, deviceId, input.requestId);
      if (winner) return winner;
    }
    throw err;
  }
}

export type OrderWithItems = Order & { items: OrderItem[] };

async function withItems(db: DB, restaurantId: string, list: Order[]): Promise<OrderWithItems[]> {
  if (list.length === 0) return [];
  const items = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.restaurantId, restaurantId), inArray(orderItems.orderId, list.map((o) => o.id))))
    .orderBy(asc(orderItems.sort));
  return list.map((o) => ({ ...o, items: items.filter((i) => i.orderId === o.id) }));
}

/**
 * What a customer's phone may see: its own orders of the last 24 h and, at a shared table
 * (table/room/area) it is still seated at, the whole table's orders (group bill).
 */
export async function ordersForCustomer(db: DB, restaurantId: string, deviceId: string, sessionId: string | null, now = new Date()) {
  const since = new Date(now.getTime() - 24 * 3600_000);
  const s = sessionId ? await customerSession(db, restaurantId, sessionId, deviceId) : null;
  const shared = s && GROUP_SEATS.has(s.seat.type) ? s.session.id : null;
  const current = s?.session.id ?? null;
  const list = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.restaurantId, restaurantId),
        shared ? or(and(eq(orders.customerDeviceId, deviceId), gt(orders.sentAt, since)), eq(orders.sessionId, shared)) : and(eq(orders.customerDeviceId, deviceId), gt(orders.sentAt, since)),
      ),
    )
    .orderBy(desc(orders.sentAt))
    .limit(30);
  return { orders: await withItems(db, restaurantId, list), sharedSessionId: shared, currentSessionId: current };
}

/* ---------------------------------------------------------------- staff */

export type ServiceCtx = { db: DB; actor: Actor; repo: TenantRepo };

function need(ctx: ServiceCtx, action: Action) {
  if (!can(ctx.actor, action, { restaurantId: ctx.repo.restaurantId })) throw new ForbiddenError();
}

/** members.id of the person acting (their matricule goes on the order), or null (dev bypass, system). */
async function memberIdOf(ctx: ServiceCtx): Promise<string | null> {
  if (ctx.actor.kind !== "member") return null;
  if (ctx.actor.memberId) return ctx.actor.memberId;
  const [m] = await ctx.db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.restaurantId, ctx.repo.restaurantId), eq(members.clerkUserId, ctx.actor.userId)))
    .limit(1);
  return m?.id ?? null;
}

/** Which "by" column each move fills. */
const BY: Record<TargetStatusKey, "confirmedBy" | "preparedBy" | "servedBy" | "cancelledBy"> = {
  confirmed: "confirmedBy",
  preparing: "preparedBy",
  ready: "preparedBy",
  served: "servedBy",
  cancelled: "cancelledBy",
};
type TargetStatusKey = "confirmed" | "preparing" | "ready" | "served" | "cancelled";

const actorTag = (a: Actor) => (a.kind === "member" ? `member:${a.userId}` : a.kind === "staff" ? `staff:${a.staffId}` : a.kind);

/** Open orders for the front desk and kitchen, plus those served in the last 30 minutes. */
export async function serviceOrders(ctx: ServiceCtx, now = new Date()) {
  need(ctx, "orders.read");
  const rid = ctx.repo.restaurantId;
  const recent = new Date(now.getTime() - 30 * 60_000);
  const list = await ctx.db
    .select()
    .from(orders)
    .where(and(eq(orders.restaurantId, rid), or(inArray(orders.status, [...ACTIVE_STATUSES]), and(eq(orders.status, "served"), gt(orders.servedAt, recent)))))
    .orderBy(asc(orders.sentAt))
    .limit(200);
  return withItems(ctx.db, rid, list);
}

export async function getOrder(ctx: ServiceCtx, orderId: string) {
  need(ctx, "orders.read");
  const o = await ctx.db.query.orders.findFirst({ where: and(eq(orders.restaurantId, ctx.repo.restaurantId), eq(orders.id, orderId)) });
  if (!o) throw new NotFoundError();
  return (await withItems(ctx.db, ctx.repo.restaurantId, [o]))[0]!;
}

/** Allowed moves on the board, and the permission each needs. Paid comes with payments (M5). */
const TRANSITIONS: Record<Exclude<OrderStatus, "sent" | "paid">, { from: OrderStatus[]; action: Action }> = {
  confirmed: { from: ["sent"], action: "orders.confirm" },
  preparing: { from: ["sent", "confirmed"], action: "orders.prepare" },
  ready: { from: ["sent", "confirmed", "preparing"], action: "orders.prepare" },
  served: { from: ["ready", "preparing", "confirmed"], action: "orders.serve" },
  cancelled: { from: ["sent", "confirmed", "preparing", "ready", "served"], action: "orders.cancel" },
};
export type TargetStatus = keyof typeof TRANSITIONS;
export const TARGET_STATUSES = Object.keys(TRANSITIONS) as TargetStatus[];

const STAMP: Record<TargetStatus, keyof Order> = {
  confirmed: "confirmedAt",
  preparing: "preparingAt",
  ready: "readyAt",
  served: "servedAt",
  cancelled: "cancelledAt",
};
/** Item status that follows an order move (cancelled items stay cancelled). */
const ITEM_FOLLOW: Partial<Record<TargetStatus, { to: ItemStatus; from: ItemStatus[] }>> = {
  preparing: { to: "preparing", from: ["pending"] },
  ready: { to: "ready", from: ["pending", "preparing"] },
  served: { to: "served", from: ["pending", "preparing", "ready"] },
  cancelled: { to: "cancelled", from: ["pending", "preparing", "ready", "served"] },
};

export async function setOrderStatus(ctx: ServiceCtx, orderId: string, to: TargetStatus, reason?: string, now = new Date()) {
  const rule = TRANSITIONS[to];
  if (!rule) throw new OrderError("invalid");
  need(ctx, rule.action);
  if (to === "cancelled" && !reason?.trim()) throw new OrderError("reason_required");
  const rid = ctx.repo.restaurantId;
  const existing = await ctx.db.query.orders.findFirst({ where: and(eq(orders.restaurantId, rid), eq(orders.id, orderId)) });
  if (!existing) throw new NotFoundError();
  if (!rule.from.includes(existing.status)) throw new OrderError("conflict");
  const by = await memberIdOf(ctx);
  await ctx.db.transaction(async (tx) => {
    const set: Partial<Order> = { status: to, [STAMP[to]]: now, updatedBy: actorTag(ctx.actor), updatedAt: now };
    // Record who handled this step (the kitchen keeps the first person who prepared it).
    if (by && !(BY[to] === "preparedBy" && existing.preparedBy)) set[BY[to]] = by;
    // Confirming by moving straight on also counts as confirming.
    if (by && to !== "cancelled" && to !== "confirmed" && !existing.confirmedBy && !existing.confirmedAt) set.confirmedBy = by;
    // Moving straight to a later step fills the skipped timestamps (reports need them).
    if (to !== "cancelled") for (const k of TARGET_STATUSES.slice(0, TARGET_STATUSES.indexOf(to))) if (k !== "cancelled" && !existing[STAMP[k]]) Object.assign(set, { [STAMP[k]]: now });
    if (to === "cancelled") set.cancelledReason = reason!.trim().slice(0, 200);
    const updated = await tx
      .update(orders)
      .set(set)
      .where(and(eq(orders.restaurantId, rid), eq(orders.id, orderId), eq(orders.status, existing.status)))
      .returning({ id: orders.id });
    // Someone else moved it first: the screen refreshes and shows the new state.
    if (updated.length === 0) throw new OrderError("conflict");
    const follow = ITEM_FOLLOW[to];
    if (follow) {
      await tx
        .update(orderItems)
        .set({ status: follow.to, updatedAt: now })
        .where(and(eq(orderItems.restaurantId, rid), eq(orderItems.orderId, orderId), inArray(orderItems.status, follow.from)));
    }
    await writeAudit(tx, ctx.actor, { restaurantId: rid, action: `order.${to}`, entity: "order", entityId: orderId, data: { from: existing.status, ...(reason ? { reason } : {}) } });
    await notify(tx, { k: "order", r: rid, o: orderId, s: existing.sessionId, d: existing.customerDeviceId });
  });
}

/**
 * Kitchen: one dish at a time. The order follows: first dish started → « en préparation »,
 * every dish ready → « prête ».
 */
export async function setItemStatus(ctx: ServiceCtx, orderId: string, itemId: string, to: "pending" | "preparing" | "ready", now = new Date()) {
  need(ctx, "orders.prepare");
  const rid = ctx.repo.restaurantId;
  const by = await memberIdOf(ctx);
  await ctx.db.transaction(async (tx) => {
    // Lock the order: two cooks finishing the last two dishes at once must both see every
    // dish's status, or the order would stay « en préparation » with every dish ready.
    const [o] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.restaurantId, rid), eq(orders.id, orderId)))
      .for("update");
    if (!o) throw new NotFoundError();
    if (!(ACTIVE_STATUSES as readonly string[]).includes(o.status)) throw new OrderError("conflict");
    const done = await tx
      .update(orderItems)
      .set({ status: to, updatedAt: now })
      .where(and(eq(orderItems.restaurantId, rid), eq(orderItems.orderId, orderId), eq(orderItems.id, itemId), notInArray(orderItems.status, ["cancelled", "served"])))
      .returning({ id: orderItems.id });
    if (done.length === 0) throw new NotFoundError();
    const items = await tx.select({ status: orderItems.status }).from(orderItems).where(and(eq(orderItems.orderId, orderId), eq(orderItems.restaurantId, rid)));
    const live = items.filter((i) => i.status !== "cancelled");
    const allReady = live.length > 0 && live.every((i) => i.status === "ready");
    const started = live.some((i) => i.status === "preparing" || i.status === "ready");
    const next: OrderStatus = allReady ? "ready" : started ? "preparing" : o.status === "ready" || o.status === "preparing" ? "confirmed" : o.status;
    if (next !== o.status) {
      const set: Partial<Order> = { status: next, updatedBy: actorTag(ctx.actor), updatedAt: now };
      if (next === "preparing" && !o.preparingAt) set.preparingAt = now;
      if (next === "ready") set.readyAt = now;
      if (!o.confirmedAt) set.confirmedAt = now;
      if (by && !o.preparedBy && (next === "preparing" || next === "ready")) set.preparedBy = by;
      await tx.update(orders).set(set).where(and(eq(orders.restaurantId, rid), eq(orders.id, orderId)));
    }
    await writeAudit(tx, ctx.actor, { restaurantId: rid, action: `order.item.${to}`, entity: "order", entityId: orderId, data: { itemId } });
    await notify(tx, { k: "order", r: rid, o: orderId, s: o.sessionId, d: o.customerDeviceId });
  });
}

/** Sessions with orders still in progress must not be closed by idle sweeps or phones leaving. */
export async function sessionHasActiveOrders(db: Pick<DB, "select">, sessionId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.sessionId, sessionId), inArray(orders.status, [...ACTIVE_STATUSES])))
    .limit(1);
  return Boolean(row);
}
