import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { buses, seats, trips } from "@/db/schema";
import { ensureSeatCodes } from "@/lib/access-codes";
import { writeAudit } from "@/lib/audit";
import { can } from "@/lib/auth/can";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import type { SeatingCtx } from "@/lib/seating/admin";
import { randomToken } from "@/lib/tokens";
import { BusLayout, buildSeatMap } from "./layout";

export class BusError extends Error {
  constructor(public readonly code: "duplicate" | "tripOpen" | "invalid") {
    super(code);
  }
}

export const BusInput = z.object({
  name: z.string().trim().min(1).max(40),
  layout: BusLayout,
});

function need(ctx: SeatingCtx) {
  if (!can(ctx.actor, "seats.write", { restaurantId: ctx.repo.restaurantId })) throw new ForbiddenError();
}

async function ownBus(ctx: SeatingCtx, busId: string) {
  const b = await ctx.db.query.buses.findFirst({ where: and(eq(buses.restaurantId, ctx.repo.restaurantId), eq(buses.id, busId)) });
  if (!b) throw new NotFoundError("bus");
  return b;
}

export async function listBuses(db: DB, restaurantId: string) {
  return db
    .select({
      id: buses.id,
      name: buses.name,
      layout: buses.layout,
      qrToken: buses.qrToken,
      active: buses.active,
      seatCount: sql<number>`(select count(*)::int from ${seats} s where s.bus_id = ${buses.id})`,
      openTrip: sql<string | null>`(select t.route from ${trips} t where t.bus_id = ${buses.id} and t.status = 'open' limit 1)`,
    })
    .from(buses)
    .where(eq(buses.restaurantId, restaurantId))
    .orderBy(asc(buses.sort), asc(buses.name));
}

/** Seats of one bus with their place on the map (for the seat picker and the print kit). */
export async function busSeats(db: DB, restaurantId: string, busId: string) {
  return db
    .select({ id: seats.id, label: seats.label, row: seats.mapRow, col: seats.mapCol, position: seats.position, qrToken: seats.qrToken, active: seats.active })
    .from(seats)
    .where(and(eq(seats.restaurantId, restaurantId), eq(seats.busId, busId)))
    .orderBy(asc(seats.sort));
}

/** Seat rows for a layout: numbers, map positions, a fresh QR token each. */
function seatRows(restaurantId: string, busId: string, layout: z.infer<typeof BusLayout>) {
  return buildSeatMap(layout).seats.map((s) => ({
    restaurantId,
    busId,
    type: "seat" as const,
    label: String(s.number),
    capacity: 1,
    mapRow: s.row,
    mapCol: s.col,
    position: s.position,
    qrToken: randomToken(),
    sort: s.number,
  }));
}

/** A new bus: its seats are generated from the layout, each with its own seat-back QR and RC number. */
export async function createBus(ctx: SeatingCtx, input: z.input<typeof BusInput>) {
  need(ctx);
  const p = BusInput.safeParse(input);
  if (!p.success) throw new BusError("invalid");
  const rid = ctx.repo.restaurantId;
  try {
    buildSeatMap(p.data.layout);
  } catch {
    throw new BusError("invalid");
  }
  const clash = await ctx.db.select({ id: buses.id }).from(buses).where(and(eq(buses.restaurantId, rid), sql`lower(${buses.name}) = lower(${p.data.name})`)).limit(1);
  if (clash.length) throw new BusError("duplicate");
  const bus = await ctx.db.transaction(async (tx) => {
    const [{ n }] = (await tx.execute<{ n: number }>(sql`select coalesce(max(sort), 0)::int as n from buses where restaurant_id = ${rid}`)).rows as [{ n: number }];
    const [b] = await tx.insert(buses).values({ restaurantId: rid, name: p.data.name, layout: p.data.layout, qrToken: randomToken(), sort: n + 1 }).returning();
    const rows = seatRows(rid, b!.id, p.data.layout);
    await tx.insert(seats).values(rows);
    return b!;
  });
  const created = await busSeats(ctx.db, rid, bus.id);
  await ensureSeatCodes(ctx.db, rid, created.map((s) => s.id));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: rid, action: "transport.bus.created", entity: "bus", entityId: bus.id, data: { name: bus.name, seats: created.length } });
  return { bus, seats: created.length };
}

/**
 * A new layout for a bus (another vehicle, a seat removed…). Seats whose number still exists keep
 * their printed QR; new numbers get one; numbers that no longer exist are removed. Not during a trip.
 */
export async function updateBusLayout(ctx: SeatingCtx, busId: string, layoutInput: unknown) {
  need(ctx);
  const bus = await ownBus(ctx, busId);
  const layout = BusLayout.safeParse(layoutInput);
  if (!layout.success) throw new BusError("invalid");
  let map;
  try {
    map = buildSeatMap(layout.data);
  } catch {
    throw new BusError("invalid");
  }
  const [open] = await ctx.db.select({ id: trips.id }).from(trips).where(and(eq(trips.busId, bus.id), eq(trips.status, "open"))).limit(1);
  if (open) throw new BusError("tripOpen");
  const rid = ctx.repo.restaurantId;
  await ctx.db.transaction(async (tx) => {
    const current = await tx.select({ id: seats.id, label: seats.label }).from(seats).where(eq(seats.busId, bus.id));
    const byLabel = new Map(current.map((s) => [s.label, s.id]));
    const wanted = new Set(map.seats.map((s) => String(s.number)));
    const gone = current.filter((s) => !wanted.has(s.label)).map((s) => s.id);
    if (gone.length) await tx.delete(seats).where(inArray(seats.id, gone));
    for (const s of map.seats) {
      const id = byLabel.get(String(s.number));
      if (id) await tx.update(seats).set({ mapRow: s.row, mapCol: s.col, position: s.position, sort: s.number, active: true }).where(eq(seats.id, id));
    }
    const fresh = seatRows(rid, bus.id, layout.data).filter((s) => !byLabel.has(s.label));
    if (fresh.length) await tx.insert(seats).values(fresh);
    await tx.update(buses).set({ layout: layout.data }).where(eq(buses.id, bus.id));
  });
  const after = await busSeats(ctx.db, rid, bus.id);
  await ensureSeatCodes(ctx.db, rid, after.map((s) => s.id));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: rid, action: "transport.bus.layout", entity: "bus", entityId: bus.id, data: { seats: after.length } });
  return after.length;
}

export async function renameBus(ctx: SeatingCtx, busId: string, name: string) {
  need(ctx);
  const bus = await ownBus(ctx, busId);
  const clean = z.string().trim().min(1).max(40).safeParse(name);
  if (!clean.success) throw new BusError("invalid");
  const clash = await ctx.db
    .select({ id: buses.id })
    .from(buses)
    .where(and(eq(buses.restaurantId, ctx.repo.restaurantId), sql`lower(${buses.name}) = lower(${clean.data})`, sql`${buses.id} <> ${bus.id}`))
    .limit(1);
  if (clash.length) throw new BusError("duplicate");
  await ctx.db.update(buses).set({ name: clean.data }).where(eq(buses.id, bus.id));
}

/** Removes a bus and its seats (orders keep their seat number). Not during a trip. */
export async function deleteBus(ctx: SeatingCtx, busId: string) {
  need(ctx);
  const bus = await ownBus(ctx, busId);
  const [open] = await ctx.db.select({ id: trips.id }).from(trips).where(and(eq(trips.busId, bus.id), eq(trips.status, "open"))).limit(1);
  if (open) throw new BusError("tripOpen");
  await ctx.db.delete(buses).where(eq(buses.id, bus.id));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: ctx.repo.restaurantId, action: "transport.bus.deleted", entity: "bus", entityId: bus.id, data: { name: bus.name } });
}

/** The bus behind a bus QR (its map opens the menu). */
export async function busByToken(db: DB, restaurantId: string, token: string) {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) return null;
  return (await db.query.buses.findFirst({ where: and(eq(buses.restaurantId, restaurantId), eq(buses.qrToken, token), eq(buses.active, true)) })) ?? null;
}
