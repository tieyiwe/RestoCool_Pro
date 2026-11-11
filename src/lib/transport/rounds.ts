import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import { orderItems, orders, trips } from "@/db/schema";
import { NotFoundError } from "@/lib/errors";
import { OrderError, setOrderStatus } from "@/lib/orders/service";
import type { ServiceCtx } from "@/lib/orders/service";

type Name = { fr: string } & Partial<Record<string, string>>;

/**
 * Everything the hostess needs for one trip: orders sorted by seat number (the order she walks the
 * aisle), seats with orders from more than one phone flagged, and what to prepare (dish totals of
 * the orders not served yet).
 */
export async function tripBoard(db: DB, restaurantId: string, tripId: string) {
  const trip = await db.query.trips.findFirst({ where: and(eq(trips.id, tripId), eq(trips.restaurantId, restaurantId)) });
  if (!trip) throw new NotFoundError("trip");
  const list = await db
    .select()
    .from(orders)
    .where(and(eq(orders.restaurantId, restaurantId), eq(orders.tripId, trip.id)))
    .orderBy(asc(orders.sentAt));
  const items = list.length
    ? await db
        .select()
        .from(orderItems)
        .where(and(eq(orderItems.restaurantId, restaurantId), inArray(orderItems.orderId, list.map((o) => o.id))))
        .orderBy(asc(orderItems.sort))
    : [];
  const seatNo = (o: { seatLabel: string | null }) => Number(o.seatLabel) || 0;
  const live = list.filter((o) => o.status !== "cancelled");
  // Same seat, different phones: the hostess checks the tickets.
  const phonesBySeat = new Map<string, Set<string>>();
  for (const o of live) {
    const k = o.seatLabel ?? "";
    phonesBySeat.set(k, (phonesBySeat.get(k) ?? new Set()).add(o.customerDeviceId ?? o.id));
  }
  const doubles = new Set([...phonesBySeat].filter(([, s]) => s.size > 1).map(([k]) => k));
  const withItems = list
    .map((o) => ({
      ...o,
      items: items.filter((i) => i.orderId === o.id && i.status !== "cancelled"),
      double: doubles.has(o.seatLabel ?? ""),
    }))
    .sort((a, b) => seatNo(a) - seatNo(b) || a.sentAt.getTime() - b.sentAt.getTime());

  // « À préparer »: dish totals of the orders still to serve.
  const todo = new Map<string, { name: Name; variant: Name | null; qty: number }>();
  for (const o of withItems) {
    if (!["sent", "confirmed", "preparing", "ready"].includes(o.status)) continue;
    for (const i of o.items) {
      const key = `${i.itemId ?? i.nameSnapshot.fr}|${i.variantId ?? ""}`;
      const cur = todo.get(key) ?? { name: i.nameSnapshot as Name, variant: (i.variantName as Name | null) ?? null, qty: 0 };
      cur.qty += i.qty;
      todo.set(key, cur);
    }
  }
  return {
    trip,
    orders: withItems,
    doubles: [...doubles].filter(Boolean).sort((a, b) => Number(a) - Number(b)),
    toPrepare: [...todo.values()].sort((a, b) => b.qty - a.qty),
    counts: {
      toConfirm: live.filter((o) => o.status === "sent").length,
      toServe: live.filter((o) => ["confirmed", "preparing", "ready"].includes(o.status)).length,
      served: live.filter((o) => o.status === "served" || o.status === "paid").length,
      total: live.reduce((s, o) => s + o.subtotal, 0),
    },
  };
}

/**
 * The hostess confirms (or serves) several orders at once: those of her round, or all. Orders
 * another person already moved are skipped, never an error. Only orders of this trip.
 */
export async function moveTripOrders(ctx: ServiceCtx, tripId: string, to: "confirmed" | "served", orderIds?: string[]) {
  const rid = ctx.repo.restaurantId;
  const trip = await ctx.db.query.trips.findFirst({ where: and(eq(trips.id, tripId), eq(trips.restaurantId, rid)) });
  if (!trip) throw new NotFoundError("trip");
  const from = to === "confirmed" ? ["sent"] : ["confirmed", "preparing", "ready"];
  const candidates = await ctx.db
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(and(eq(orders.restaurantId, rid), eq(orders.tripId, trip.id)));
  const wanted = new Set(orderIds ?? candidates.map((c) => c.id));
  let moved = 0;
  for (const c of candidates) {
    if (!wanted.has(c.id) || !from.includes(c.status)) continue;
    try {
      await setOrderStatus(ctx, c.id, to);
      moved++;
    } catch (err) {
      if (!(err instanceof OrderError && err.code === "conflict")) throw err;
    }
  }
  return moved;
}
