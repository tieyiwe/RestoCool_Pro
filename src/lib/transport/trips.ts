import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { buses, members, orders, routeAssignments, routes, seats, sessionDevices, tableSessions, trips } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { can } from "@/lib/auth/can";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { notify } from "@/lib/realtime/events";
import type { SeatingCtx } from "@/lib/seating/admin";
import { routeLabel } from "./routes";

export class TripError extends Error {
  constructor(public readonly code: "busBusy" | "notAssigned" | "invalid") {
    super(code);
  }
}

export const StartTripInput = z.object({
  busId: z.uuid(),
  routeId: z.uuid(),
  /** Local time « 2026-11-11T07:00 » (Ouagadougou = UTC) or empty for now. */
  departure: z.string().trim().max(20).optional(),
});

/** Who may run trips: anyone who serves orders (hostess); leads may run any itinerary. */
function canRun(ctx: SeatingCtx) {
  return can(ctx.actor, "orders.confirm", { restaurantId: ctx.repo.restaurantId });
}
const isLead = (ctx: SeatingCtx) => can(ctx.actor, "staff.write", { restaurantId: ctx.repo.restaurantId });

async function actingMember(ctx: SeatingCtx): Promise<string | null> {
  if (ctx.actor.kind !== "member") return null;
  if (ctx.actor.memberId) return ctx.actor.memberId;
  const actor = ctx.actor;
  const [m] = await ctx.db.select({ id: members.id }).from(members).where(and(eq(members.restaurantId, ctx.repo.restaurantId), eq(members.clerkUserId, actor.userId))).limit(1);
  return m?.id ?? null;
}

/** Itineraries this person may start trips on: all for leads, their assigned ones for hostesses. */
export async function startableRoutes(ctx: SeatingCtx) {
  const rid = ctx.repo.restaurantId;
  if (isLead(ctx)) return ctx.db.select().from(routes).where(and(eq(routes.restaurantId, rid), eq(routes.active, true))).orderBy(asc(routes.sort));
  const me = await actingMember(ctx);
  if (!me) return [];
  return ctx.db
    .select({ id: routes.id, restaurantId: routes.restaurantId, origin: routes.origin, destination: routes.destination, active: routes.active, sort: routes.sort, createdAt: routes.createdAt, updatedAt: routes.updatedAt })
    .from(routeAssignments)
    .innerJoin(routes, eq(routes.id, routeAssignments.routeId))
    .where(and(eq(routeAssignments.restaurantId, rid), eq(routeAssignments.memberId, me), eq(routes.active, true)))
    .orderBy(asc(routes.sort));
}

/** « Démarrer le voyage »: the bus's seats open for orders on this itinerary. One trip at a time per bus. */
export async function startTrip(ctx: SeatingCtx, input: z.input<typeof StartTripInput>, now = new Date()) {
  if (!canRun(ctx)) throw new ForbiddenError();
  const p = StartTripInput.safeParse(input);
  if (!p.success) throw new TripError("invalid");
  const rid = ctx.repo.restaurantId;
  const bus = await ctx.db.query.buses.findFirst({ where: and(eq(buses.id, p.data.busId), eq(buses.restaurantId, rid), eq(buses.active, true)) });
  const route = await ctx.db.query.routes.findFirst({ where: and(eq(routes.id, p.data.routeId), eq(routes.restaurantId, rid)) });
  if (!bus || !route) throw new NotFoundError();
  if (!(await startableRoutes(ctx)).some((r) => r.id === route.id)) throw new TripError("notAssigned");
  const departureAt = p.data.departure ? new Date(`${p.data.departure.length === 16 ? p.data.departure : p.data.departure.slice(0, 16)}:00Z`) : now;
  if (Number.isNaN(departureAt.getTime())) throw new TripError("invalid");
  const by = await actingMember(ctx);
  try {
    const [trip] = await ctx.db
      .insert(trips)
      .values({ restaurantId: rid, busId: bus.id, routeId: route.id, route: routeLabel(route), departureAt, openedBy: by })
      .returning();
    await writeAudit(ctx.db, ctx.actor, { restaurantId: rid, action: "transport.trip.started", entity: "trip", entityId: trip!.id, data: { bus: bus.name, route: trip!.route } });
    await notify(ctx.db, { k: "menu", r: rid });
    return trip!;
  } catch (err) {
    // The unique index allows one open trip per bus.
    if (String((err as { cause?: { code?: string } }).cause?.code ?? (err as { code?: string }).code) === "23505") throw new TripError("busBusy");
    throw err;
  }
}

/** « Terminer le voyage »: every seat of the bus is freed for the next departure. */
export async function endTrip(ctx: SeatingCtx, tripId: string, now = new Date()) {
  if (!canRun(ctx)) throw new ForbiddenError();
  const rid = ctx.repo.restaurantId;
  const trip = await ctx.db.query.trips.findFirst({ where: and(eq(trips.id, tripId), eq(trips.restaurantId, rid), eq(trips.status, "open")) });
  if (!trip) throw new NotFoundError();
  const by = await actingMember(ctx);
  await ctx.db.transaction(async (tx) => {
    await tx.update(trips).set({ status: "closed", closedAt: now, closedBy: by }).where(eq(trips.id, trip.id));
    const busSeatIds = (await tx.select({ id: seats.id }).from(seats).where(eq(seats.busId, trip.busId))).map((s) => s.id);
    if (busSeatIds.length) {
      const open = await tx
        .update(tableSessions)
        .set({ status: "closed", closedAt: now, closedReason: "trip_ended" })
        .where(and(eq(tableSessions.restaurantId, rid), inArray(tableSessions.seatId, busSeatIds), eq(tableSessions.status, "open")))
        .returning({ id: tableSessions.id });
      if (open.length) await tx.update(sessionDevices).set({ leftAt: now }).where(inArray(sessionDevices.sessionId, open.map((s) => s.id)));
    }
  });
  await writeAudit(ctx.db, ctx.actor, { restaurantId: rid, action: "transport.trip.ended", entity: "trip", entityId: trip.id });
  await notify(ctx.db, { k: "menu", r: rid });
}

/** The open trip of a bus, if any (orders from its seats belong to it). */
export async function openTripOfBus(db: Pick<DB, "query">, busId: string) {
  return (await db.query.trips.findFirst({ where: and(eq(trips.busId, busId), eq(trips.status, "open")) })) ?? null;
}

/** Trips screen: each bus with its open trip (and counts), latest closed trips. */
export async function tripsOverview(db: DB, restaurantId: string) {
  const busList = await db.select().from(buses).where(and(eq(buses.restaurantId, restaurantId), eq(buses.active, true))).orderBy(asc(buses.sort), asc(buses.name));
  const open = await db
    .select({
      trip: trips,
      orders: sql<number>`(select count(*)::int from ${orders} o where o.trip_id = ${trips.id} and o.status <> 'cancelled')`,
      toConfirm: sql<number>`(select count(*)::int from ${orders} o where o.trip_id = ${trips.id} and o.status = 'sent')`,
      total: sql<number>`(select coalesce(sum(o.subtotal), 0)::int from ${orders} o where o.trip_id = ${trips.id} and o.status <> 'cancelled')`,
    })
    .from(trips)
    .where(and(eq(trips.restaurantId, restaurantId), eq(trips.status, "open")));
  const recent = await db.select().from(trips).where(and(eq(trips.restaurantId, restaurantId), eq(trips.status, "closed"))).orderBy(desc(trips.closedAt)).limit(10);
  return { buses: busList.map((b) => ({ bus: b, open: open.find((o) => o.trip.busId === b.id) ?? null })), recent };
}
