import "server-only";
import { GROUP_SEATS } from "./group-seats";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { areas, orders, restaurants, seats, sessionDevices, tableSessions } from "@/db/schema";
import { DEFAULT_INACTIVITY } from "./tables";

/** Sessions opened from a printed QR close after this long with no activity (never while orders are in progress). */
export const QR_SESSION_IDLE_MS = 4 * 60 * 60 * 1000;
/** Extra margin before the server frees a picker seat whose phone went silent. */
const PICKER_GRACE_MS = 2 * 60 * 1000;
/**
 * Seats one group of people occupies (and shares a bill at): tables and private rooms. Areas,
 * counter, takeaway and delivery are shared by unrelated customers: never « occupied », never
 * « joined ». Same set as the shared bill (GROUP_SEATS).
 */
const OCCUPIABLE = GROUP_SEATS;

export type JoinResult =
  | { ok: true; sessionId: string; seat: { id: string; type: string; label: string }; joined: boolean }
  | { ok: false; reason: "occupied" | "not_found" };

type Restaurant = typeof restaurants.$inferSelect;

/** Close abandoned sessions of one restaurant. Called lazily from the public endpoints. */
export async function sweepStale(db: DB, r: Restaurant, now = new Date()): Promise<number> {
  const t = r.settings.inactivity ?? DEFAULT_INACTIVITY;
  const pickerCutoff = new Date(now.getTime() - (t.warnAfterSec + t.releaseAfterSec) * 1000 - PICKER_GRACE_MS);
  const qrCutoff = new Date(now.getTime() - QR_SESSION_IDLE_MS);
  const stale = await db
    .select({ id: tableSessions.id, source: tableSessions.source })
    .from(tableSessions)
    .where(
      and(
        eq(tableSessions.restaurantId, r.id),
        eq(tableSessions.status, "open"),
        or(
          // Inactivity release only frees a picker seat before any order is sent from it;
          // once the table has ordered, it follows the long idle rule like a QR table.
          and(
            eq(tableSessions.source, "picker"),
            lt(tableSessions.lastActivityAt, pickerCutoff),
            sql`not exists (select 1 from ${orders} where ${orders.sessionId} = ${tableSessions.id} and ${orders.status} <> 'cancelled')`,
          ),
          lt(tableSessions.lastActivityAt, qrCutoff),
        ),
        // A table with orders still in progress stays open whatever the phones do.
        sql`not exists (select 1 from ${orders} where ${orders.sessionId} = ${tableSessions.id} and ${orders.status} in ('sent','confirmed','preparing','ready'))`,
      ),
    );
  if (stale.length === 0) return 0;
  await db
    .update(tableSessions)
    .set({ status: "closed", closedAt: now, closedReason: sql`case when ${tableSessions.source} = 'picker' then 'inactive' else 'expired' end` })
    .where(and(eq(tableSessions.restaurantId, r.id), inArray(tableSessions.id, stale.map((s) => s.id))));
  return stale.length;
}

/** Find an active seat of this restaurant, by printed token or by id (picker). */
export async function findSeat(db: DB, restaurantId: string, by: { token: string } | { seatId: string }) {
  return db.query.seats.findFirst({
    where: and(
      eq(seats.restaurantId, restaurantId),
      eq(seats.active, true),
      "token" in by ? eq(seats.qrToken, by.token) : eq(seats.id, by.seatId),
    ),
  });
}

/**
 * Open the seat's session, or join the open one. In picker mode, a seat already taken by
 * another phone returns `occupied` unless the customer chose « Rejoindre ».
 * Scanning the seat's own QR always joins: the phone is physically at that table.
 */
export async function joinSession(
  db: DB,
  r: Restaurant,
  input: { seat: { id: string; type: string; label: string }; deviceId: string; source: "qr" | "picker"; confirmJoin?: boolean; customerName?: string | null },
  now = new Date(),
): Promise<JoinResult> {
  await sweepStale(db, r, now);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const open = await tx.query.tableSessions.findFirst({
          where: and(eq(tableSessions.restaurantId, r.id), eq(tableSessions.seatId, input.seat.id), eq(tableSessions.status, "open")),
        });
        let sessionId: string;
        let joined = false;
        if (open) {
          const others = await tx
            .select({ deviceId: sessionDevices.deviceId })
            .from(sessionDevices)
            .where(and(eq(sessionDevices.sessionId, open.id), isNull(sessionDevices.leftAt)));
          const mine = others.some((o) => o.deviceId === input.deviceId);
          const taken = OCCUPIABLE.has(input.seat.type) && others.some((o) => o.deviceId !== input.deviceId);
          if (input.source === "picker" && taken && !mine && !input.confirmJoin) return { ok: false as const, reason: "occupied" as const };
          sessionId = open.id;
          joined = taken;
          await tx.update(tableSessions).set({ lastActivityAt: now }).where(eq(tableSessions.id, open.id));
        } else {
          const [created] = await tx
            .insert(tableSessions)
            .values({ restaurantId: r.id, seatId: input.seat.id, source: input.source, openedByDevice: input.deviceId, openedAt: now, lastActivityAt: now })
            .returning({ id: tableSessions.id });
          sessionId = created!.id;
        }
        await tx
          .insert(sessionDevices)
          .values({ restaurantId: r.id, sessionId, deviceId: input.deviceId, customerName: input.customerName ?? null, joinedAt: now, lastSeenAt: now })
          .onConflictDoUpdate({
            target: [sessionDevices.sessionId, sessionDevices.deviceId],
            set: { leftAt: null, lastSeenAt: now, customerName: input.customerName ?? null },
          });
        return { ok: true as const, sessionId, seat: input.seat, joined };
      });
    } catch (err) {
      // Two phones opened the same seat at the same instant: the unique index let one win; retry joins it.
      if (attempt === 0 && String((err as { cause?: { code?: string } }).cause?.code ?? (err as { code?: string }).code) === "23505") continue;
      throw err;
    }
  }
  return { ok: false, reason: "not_found" };
}

async function deviceInOpenSession(db: DB, restaurantId: string, sessionId: string, deviceId: string) {
  const [row] = await db
    .select({ id: sessionDevices.id })
    .from(sessionDevices)
    .innerJoin(tableSessions, eq(tableSessions.id, sessionDevices.sessionId))
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

/** Customer activity keeps the session (and the picker seat) alive. Returns false if the session is gone. */
export async function heartbeat(db: DB, restaurantId: string, sessionId: string, deviceId: string, now = new Date()): Promise<boolean> {
  const row = await deviceInOpenSession(db, restaurantId, sessionId, deviceId);
  if (!row) return false;
  await db.update(sessionDevices).set({ lastSeenAt: now }).where(eq(sessionDevices.id, row.id));
  await db.update(tableSessions).set({ lastActivityAt: now }).where(and(eq(tableSessions.restaurantId, restaurantId), eq(tableSessions.id, sessionId)));
  return true;
}

/** A phone leaves (changed seat, or inactivity release). The last phone out closes the session. */
export async function leaveSession(db: DB, restaurantId: string, sessionId: string, deviceId: string, reason: "released" | "inactive", now = new Date()) {
  const row = await deviceInOpenSession(db, restaurantId, sessionId, deviceId);
  if (!row) return;
  await db.transaction(async (tx) => {
    await tx.update(sessionDevices).set({ leftAt: now }).where(eq(sessionDevices.id, row.id));
    const [left] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(sessionDevices)
      .where(and(eq(sessionDevices.sessionId, sessionId), isNull(sessionDevices.leftAt)));
    const [active] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(eq(orders.sessionId, sessionId), inArray(orders.status, ["sent", "confirmed", "preparing", "ready"])));
    if ((left?.n ?? 0) === 0 && (active?.n ?? 0) === 0) {
      await tx
        .update(tableSessions)
        .set({ status: "closed", closedAt: now, closedReason: reason })
        .where(and(eq(tableSessions.restaurantId, restaurantId), eq(tableSessions.id, sessionId), eq(tableSessions.status, "open")));
    }
  });
}

/** Seats that have their own printed QR (with the « one QR per table/room » strategy). */
const PRINTED_SEATS = new Set(["table", "room", "area"]);

/**
 * May a customer choose this seat by id (seat picker)? With one QR per table/room, those seats
 * are chosen by scanning their printed token only: a seat id seen once (it comes back from a
 * join) must not let a phone rejoin that table later from anywhere.
 */
export function pickable(r: Pick<Restaurant, "settings">, seat: { type: string }): boolean {
  const perSeat = (r.settings.qrStrategy ?? "per_seat") === "per_seat";
  const modes = new Set<string>(r.settings.seatingModes ?? ["table", "takeaway"]);
  return modes.has(seat.type) && (!perSeat || !PRINTED_SEATS.has(seat.type));
}
/** Seats the customer may pick, with an « occupied » flag (open session). Tokens are never returned. */
export async function pickerSeats(db: DB, r: Restaurant) {
  await sweepStale(db, r);
  const [rows, areaRows, open] = await Promise.all([
    db.select().from(seats).where(and(eq(seats.restaurantId, r.id), eq(seats.active, true))),
    db.select().from(areas).where(eq(areas.restaurantId, r.id)),
    db.select({ seatId: tableSessions.seatId }).from(tableSessions).where(and(eq(tableSessions.restaurantId, r.id), eq(tableSessions.status, "open"))),
  ]);
  const occupied = new Set(open.map((o) => o.seatId));
  return rows
    .filter((s) => pickable(r, s))
    .sort((a, b) => a.type.localeCompare(b.type) || a.sort - b.sort || a.label.localeCompare(b.label, "fr", { numeric: true }))
    .map((s) => ({
      id: s.id,
      type: s.type,
      label: s.label,
      capacity: s.capacity,
      area: s.areaId ? (areaRows.find((a) => a.id === s.areaId)?.name ?? null) : null,
      occupied: OCCUPIABLE.has(s.type) && occupied.has(s.id),
    }));
}
