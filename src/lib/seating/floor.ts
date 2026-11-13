import "server-only";
import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { orders, restaurants, seats, sessionDevices, tableSessions } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { can, type Actor } from "@/lib/auth/can";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { notify } from "@/lib/realtime/events";
import { sweepStale } from "./sessions";

/** Seats a group occupies and that staff free by hand: tables and private rooms. */
const FLOOR_SEATS = ["table", "room"] as const;

/**
 * State of one table, from what is happening there now (most urgent first):
 *  ready    – dishes ready, waiting to be served
 *  waiting  – order received, not yet confirmed (or confirmed, not started)
 *  kitchen  – being prepared
 *  eating   – everything served, the customers are still there (table not freed yet)
 *  seated   – customers there (QR scanned / table picked), nothing ordered yet
 *  free     – available
 */
export type TableState = "ready" | "waiting" | "kitchen" | "eating" | "seated" | "free";

export type FloorTable = {
  seatId: string;
  type: "table" | "room";
  label: string;
  areaId: string | null;
  capacity: number | null;
  state: TableState;
  sessionId: string | null;
  since: string | null;
  phones: number;
  orders: number;
  total: number;
};

export type Floor = {
  tables: FloorTable[];
  counts: Record<TableState, number>;
  /** Today's orders (business day), every place included (tables, rooms, counter, takeaway…). */
  today: { pending: number; kitchen: number; ready: number; served: number; cancelled: number };
};

export async function floorStatus(db: DB, restaurantId: string, now = new Date()): Promise<Floor> {
  // Abandoned tables are freed first: the floor never shows people who already left.
  const [r] = await db.select({ id: restaurants.id, settings: restaurants.settings }).from(restaurants).where(eq(restaurants.id, restaurantId));
  if (r) await sweepStale(db, r, now);
  // Written out in full: inside a select list Drizzle would print the column without its table.
  const sid = sql.raw(`"table_sessions"."id"`);
  const [seatRows, open, todayRows] = await Promise.all([
    db
      .select({ id: seats.id, type: seats.type, label: seats.label, areaId: seats.areaId, capacity: seats.capacity, sort: seats.sort })
      .from(seats)
      .where(and(eq(seats.restaurantId, restaurantId), eq(seats.active, true), inArray(seats.type, [...FLOOR_SEATS]), isNull(seats.busId)))
      .orderBy(asc(seats.type), asc(seats.sort)),
    db
      .select({
        id: tableSessions.id,
        seatId: tableSessions.seatId,
        openedAt: tableSessions.openedAt,
        phones: sql<number>`(select count(*)::int from ${sessionDevices} d where d.session_id = ${sid} and d.left_at is null)`,
        statuses: sql<string[]>`coalesce((select array_agg(o.status::text) from ${orders} o where o.session_id = ${sid}), '{}')`,
        total: sql<number>`coalesce((select sum(o.subtotal)::int from ${orders} o where o.session_id = ${sid} and o.status <> 'cancelled'), 0)`,
      })
      .from(tableSessions)
      .where(and(eq(tableSessions.restaurantId, restaurantId), eq(tableSessions.status, "open"))),
    db
      .select({ status: orders.status, n: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(eq(orders.restaurantId, restaurantId), gte(orders.businessDate, now.toISOString().slice(0, 10))))
      .groupBy(orders.status),
  ]);
  const bySeat = new Map(open.map((s) => [s.seatId, s]));
  const tables: FloorTable[] = seatRows
    .map((s) => {
      const sess = bySeat.get(s.id);
      const st = sess?.statuses ?? [];
      const live = st.filter((x) => x !== "cancelled");
      const state: TableState = !sess
        ? "free"
        : st.includes("ready")
          ? "ready"
          : st.includes("sent") || st.includes("confirmed")
            ? "waiting"
            : st.includes("preparing")
              ? "kitchen"
              : live.length > 0
                ? "eating"
                : "seated";
      return {
        seatId: s.id,
        type: s.type as "table" | "room",
        label: s.label,
        areaId: s.areaId,
        capacity: s.capacity,
        state,
        sessionId: sess?.id ?? null,
        since: sess?.openedAt.toISOString() ?? null,
        phones: sess?.phones ?? 0,
        orders: live.length,
        total: sess?.total ?? 0,
      };
    })
    .sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label, "fr", { numeric: true }));
  const counts: Record<TableState, number> = { ready: 0, waiting: 0, kitchen: 0, eating: 0, seated: 0, free: 0 };
  for (const t of tables) counts[t.state]++;
  const n = (s: string[]) => todayRows.filter((x) => s.includes(x.status)).reduce((a, x) => a + x.n, 0);
  return {
    tables,
    counts,
    today: { pending: n(["sent", "confirmed"]), kitchen: n(["preparing"]), ready: n(["ready"]), served: n(["served", "paid"]), cancelled: n(["cancelled"]) },
  };
}

export class TableBusyError extends Error {
  readonly code = "table_busy";
}

/**
 * « Table libérée »: the customers left, staff free the table or room by hand (after « Servi »,
 * from the service board, the order page or the floor plan). Anyone who may serve can do it.
 * Refused while one of the table's orders is still in progress (finish or cancel it first).
 * The phones still on the page forget the seat (their heartbeat answers 410).
 */
export async function releaseTable(ctx: { db: DB; actor: Actor; restaurantId: string }, sessionId: string, now = new Date()) {
  if (!can(ctx.actor, "orders.serve", { restaurantId: ctx.restaurantId })) throw new ForbiddenError();
  const [sess] = await ctx.db
    .select({ id: tableSessions.id, status: tableSessions.status, seatType: seats.type, label: seats.label })
    .from(tableSessions)
    .innerJoin(seats, eq(seats.id, tableSessions.seatId))
    .where(and(eq(tableSessions.restaurantId, ctx.restaurantId), eq(tableSessions.id, sessionId)));
  if (!sess || !(FLOOR_SEATS as readonly string[]).includes(sess.seatType)) throw new NotFoundError("session");
  if (sess.status !== "open") return { already: true };
  const [busy] = await ctx.db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.restaurantId, ctx.restaurantId), eq(orders.sessionId, sessionId), inArray(orders.status, ["sent", "confirmed", "preparing", "ready"])))
    .limit(1);
  if (busy) throw new TableBusyError();
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(tableSessions)
      .set({ status: "closed", closedAt: now, closedReason: "staff", closedBy: ctx.actor.kind === "member" ? ctx.actor.userId : null })
      .where(and(eq(tableSessions.restaurantId, ctx.restaurantId), eq(tableSessions.id, sessionId), eq(tableSessions.status, "open")));
    await writeAudit(tx, ctx.actor, { restaurantId: ctx.restaurantId, action: "seating.table.released", entity: "table_session", entityId: sessionId, data: { label: sess.label } });
    await notify(tx, { k: "session", r: ctx.restaurantId, s: sessionId });
  });
  return { already: false };
}

/** Open table/room sessions of a business (the board shows « Libérer la table » on their served orders). */
export async function openTableSessionIds(db: DB, restaurantId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: tableSessions.id })
    .from(tableSessions)
    .innerJoin(seats, eq(seats.id, tableSessions.seatId))
    .where(and(eq(tableSessions.restaurantId, restaurantId), eq(tableSessions.status, "open"), inArray(seats.type, [...FLOOR_SEATS])));
  return new Set(rows.map((r) => r.id));
}
