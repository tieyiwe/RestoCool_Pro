import "server-only";
import { createHmac } from "node:crypto";
import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { openingHours, reservations, type Reservation, type ReservationStatus, type restaurants } from "@/db/schema";

type Restaurant = typeof restaurants.$inferSelect;
import { generateCode } from "@/lib/access-code-format";
import { writeAudit } from "@/lib/audit";
import { can, type Actor } from "@/lib/auth/can";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { normalizeJoinPhone } from "@/lib/personnel/join";
import { hasFeature } from "@/lib/plan";
import { freeLaunchActive } from "@/lib/platform/flags";
import { notify } from "@/lib/realtime/events";
import { sha256 } from "@/lib/tokens";

/* ------------------------------------------------------------------ settings */

export type ReservationConfig = {
  enabled: boolean;
  slotMinutes: number;
  maxParty: number;
  maxCoversPerSlot: number;
  noticeMinutes: number;
  daysAhead: number;
  note?: string;
  /** Minutes after the reservation time when the check-in QR stops working and the guest counts as absent. */
  expiryMinutes: number;
};
export const RESERVATION_DEFAULTS: ReservationConfig = { enabled: false, slotMinutes: 30, maxParty: 12, maxCoversPerSlot: 0, noticeMinutes: 60, daysAhead: 30, expiryMinutes: 60 };
export const EXPIRY_CHOICES = [15, 30, 45, 60, 90, 120, 180] as const;
/** Hours used when the business entered no opening hours at all. */
const DEFAULT_HOURS = { opens: "11:00", closes: "22:00" };

export const ReservationSettingsInput = z.object({
  enabled: z.boolean(),
  slotMinutes: z.coerce.number().int().refine((n) => [15, 30, 60].includes(n)),
  maxParty: z.coerce.number().int().min(1).max(200),
  maxCoversPerSlot: z.coerce.number().int().min(0).max(2000),
  noticeMinutes: z.coerce.number().int().min(0).max(7 * 24 * 60),
  daysAhead: z.coerce.number().int().min(1).max(365),
  note: z.string().trim().max(300).optional(),
  expiryMinutes: z.coerce.number().int().refine((n) => (EXPIRY_CHOICES as readonly number[]).includes(n)),
});

type R = Pick<Restaurant, "id" | "settings" | "plan" | "planStatus" | "planExpiresAt" | "kind">;

export const reservationConfig = (r: Pick<Restaurant, "settings">): ReservationConfig => ({ ...RESERVATION_DEFAULTS, ...(r.settings.reservations ?? {}) });

/** The plan allows reservations: Pro and Business, and every business while the launch offer is on. */
export const reservationsInPlan = (r: R) => freeLaunchActive() || hasFeature(r, "reservations");

/** Reservations open on the public page: turned on by the business and allowed by its plan. */
export const reservationsOpen = (r: R) => r.kind !== "transport" && reservationConfig(r).enabled && reservationsInPlan(r);

/* ------------------------------------------------------------------ slots */

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return h! * 60 + m!;
};
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
/** Business day and minute now (Africa/Ouagadougou = UTC). */
const today = (now: Date) => now.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const HOLDING: ReservationStatus[] = ["requested", "confirmed", "seated"];

export type Slot = { time: string; left: number | null };

/**
 * Bookable times of a day: from opening to one hour before closing (a reservation needs time to
 * eat), every `slotMinutes`, without the past (plus the minimum notice) and full slots. A day
 * with no hours while others have hours is closed; no hours at all = 11:00–22:00.
 */
export async function slotsFor(db: DB, r: R, day: string, now = new Date()): Promise<Slot[]> {
  const cfg = reservationConfig(r);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < today(now) || day > addDays(today(now), cfg.daysAhead)) return [];
  const hours = await db.select().from(openingHours).where(eq(openingHours.restaurantId, r.id));
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  const ranges = hours.length === 0 ? [DEFAULT_HOURS] : hours.filter((h) => h.weekday === weekday);
  const times = new Set<number>();
  for (const h of ranges) {
    const open = toMin(h.opens);
    let close = toMin(h.closes);
    if (close <= open) close = 24 * 60; // runs past midnight: bookable until the end of the day
    const last = Math.max(open, close - 60);
    for (let t = Math.ceil(open / cfg.slotMinutes) * cfg.slotMinutes; t <= last && t < 24 * 60; t += cfg.slotMinutes) times.add(t);
  }
  const earliest = day === today(now) ? now.getUTCHours() * 60 + now.getUTCMinutes() + cfg.noticeMinutes : -1;
  let taken = new Map<string, number>();
  if (cfg.maxCoversPerSlot > 0) {
    const rows = await db
      .select({ time: reservations.time, covers: sql<number>`sum(${reservations.partySize})::int` })
      .from(reservations)
      .where(and(eq(reservations.restaurantId, r.id), eq(reservations.date, day), inArray(reservations.status, HOLDING)))
      .groupBy(reservations.time);
    taken = new Map(rows.map((x) => [x.time, x.covers]));
  }
  return [...times]
    .sort((a, b) => a - b)
    .filter((t) => t >= earliest)
    .map((t) => {
      const time = toHHMM(t);
      return { time, left: cfg.maxCoversPerSlot > 0 ? Math.max(0, cfg.maxCoversPerSlot - (taken.get(time) ?? 0)) : null };
    })
    .filter((s) => s.left === null || s.left > 0);
}

/* ------------------------------------------------------------------ customer link */

/**
 * The customer's private link token: an HMAC of the reservation id, so every email can carry the
 * same link without storing the token (only its SHA-256 is stored, for the lookup).
 */
function linkSecret(): string {
  return process.env.SESSION_SECRET || process.env.CLERK_SECRET_KEY || process.env.DATABASE_URL || "restocool-dev";
}
export const reservationToken = (id: string) => createHmac("sha256", sha256(`rc-resv|${linkSecret()}`)).update(id).digest("base64url").slice(0, 32);
/** The check-in QR token (a different secret use than the customer's link: the QR only checks in). */
export const checkinToken = (id: string) => createHmac("sha256", sha256(`rc-resv-checkin|${linkSecret()}`)).update(id).digest("base64url").slice(0, 32);
export const checkinPath = (id: string) => `/rv/${checkinToken(id)}`;

/** When the reservation's QR stops working: its time + the business's expiry minutes. */
export const expiresAt = (x: Pick<Reservation, "date" | "time">, cfg: Pick<ReservationConfig, "expiryMinutes">) =>
  new Date(Date.parse(`${x.date}T${x.time}:00Z`) + cfg.expiryMinutes * 60_000);

/** The check-in QR can be used right now: confirmed, not used yet, not expired. */
export const qrValid = (x: Reservation, cfg: Pick<ReservationConfig, "expiryMinutes">, now = new Date()) =>
  x.status === "confirmed" && !x.checkedInAt && Boolean(x.checkinHash) && now.getTime() <= expiresAt(x, cfg).getTime();

/* ------------------------------------------------------------------ booking */

export const ReservationInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  partySize: z.coerce.number().int().min(1).max(200),
  name: z.string().trim().min(2).max(60),
  email: z.email().max(120).transform((e) => e.toLowerCase()),
  phone: z
    .string()
    .trim()
    .max(30)
    .transform((v, c) => normalizeJoinPhone(v) ?? (c.addIssue({ code: "custom", message: "phone" }), z.NEVER)),
  note: z.string().trim().max(300).optional(),
  locale: z.enum(["fr", "en", "zh"]).default("fr"),
});

export class ReservationError extends Error {
  constructor(readonly code: "closed" | "slot" | "party" | "full" | "transition") {
    super(code);
  }
}

/** A customer asks for a table. The same request twice (email + day + time) gives the first one back. */
export async function createReservation(db: DB, r: R, input: z.infer<typeof ReservationInput>, deviceId: string | null, now = new Date()) {
  if (!reservationsOpen(r)) throw new ReservationError("closed");
  const cfg = reservationConfig(r);
  if (input.partySize > cfg.maxParty) throw new ReservationError("party");
  const slot = (await slotsFor(db, r, input.date, now)).find((s) => s.time === input.time);
  if (!slot) throw new ReservationError("slot");
  const [dup] = await db
    .select()
    .from(reservations)
    .where(
      and(
        eq(reservations.restaurantId, r.id),
        eq(reservations.email, input.email),
        eq(reservations.date, input.date),
        eq(reservations.time, input.time),
        inArray(reservations.status, ["requested", "confirmed"]),
      ),
    );
  if (dup) return { reservation: dup, duplicate: true };
  if (slot.left !== null && slot.left < input.partySize) throw new ReservationError("full");
  for (let attempt = 0; ; attempt++) {
    const id = crypto.randomUUID();
    try {
      const [row] = await db
        .insert(reservations)
        .values({
          id,
          restaurantId: r.id,
          ref: `R-${generateCode()}`,
          date: input.date,
          time: input.time,
          partySize: input.partySize,
          name: input.name,
          email: input.email,
          phone: input.phone,
          note: input.note || null,
          locale: input.locale,
          tokenHash: sha256(reservationToken(id)),
          deviceHash: deviceId ? sha256(deviceId) : null,
        })
        .returning();
      await notify(db, { k: "reservation", r: r.id });
      return { reservation: row!, duplicate: false };
    } catch (err) {
      // The 5-character reference collided (very rare): try another one.
      if (attempt < 4 && /reservations_ref_uq/.test(String((err as { constraint?: string }).constraint ?? err))) continue;
      throw err;
    }
  }
}

/** The customer's own reservation, from their private link. */
export async function reservationByToken(db: DB, token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [row] = await db.select().from(reservations).where(eq(reservations.tokenHash, sha256(token)));
  return row ?? null;
}

/** The customer cancels (until the time of the reservation). */
export async function cancelByCustomer(db: DB, token: string, now = new Date()) {
  const row = await reservationByToken(db, token);
  if (!row) throw new NotFoundError();
  if (!["requested", "confirmed"].includes(row.status)) throw new ReservationError("transition");
  const [up] = await db
    .update(reservations)
    .set({ status: "cancelled", cancelledBy: "customer", statusAt: now, statusBy: "customer", updatedAt: now })
    .where(eq(reservations.id, row.id))
    .returning();
  await notify(db, { k: "reservation", r: row.restaurantId });
  return up!;
}

/* ------------------------------------------------------------------ business side */

type StaffCtx = { db: DB; actor: Actor; restaurantId: string };
const who = (a: Actor) => (a.kind === "member" ? (a.memberId ?? a.userId) : a.kind);

function assertCan(ctx: StaffCtx) {
  if (!can(ctx.actor, "reservations.write", { restaurantId: ctx.restaurantId })) throw new ForbiddenError();
}

/** Reservations from `from` to `to` (inclusive), soonest first; plus the requests still waiting. */
export async function businessReservations(ctx: StaffCtx, from: string, to: string) {
  assertCan(ctx);
  const [list, waiting] = await Promise.all([
    ctx.db
      .select()
      .from(reservations)
      .where(and(eq(reservations.restaurantId, ctx.restaurantId), gte(reservations.date, from), lte(reservations.date, to)))
      .orderBy(asc(reservations.date), asc(reservations.time), asc(reservations.createdAt)),
    ctx.db
      .select()
      .from(reservations)
      .where(and(eq(reservations.restaurantId, ctx.restaurantId), eq(reservations.status, "requested"), gte(reservations.date, from)))
      .orderBy(asc(reservations.date), asc(reservations.time)),
  ]);
  return { list, waiting };
}

/** Requests waiting for an answer (badge, « À surveiller »). */
export async function pendingReservations(db: DB, restaurantId: string, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reservations)
    .where(and(eq(reservations.restaurantId, restaurantId), eq(reservations.status, "requested"), gte(reservations.date, today(now))));
  return row?.n ?? 0;
}

export const RESERVATION_ACTIONS = ["confirm", "decline", "seat", "complete", "no_show", "cancel"] as const;
export type ReservationAction = (typeof RESERVATION_ACTIONS)[number];
const MOVES: Record<ReservationAction, { from: ReservationStatus[]; to: ReservationStatus }> = {
  confirm: { from: ["requested"], to: "confirmed" },
  decline: { from: ["requested"], to: "declined" },
  seat: { from: ["requested", "confirmed"], to: "seated" },
  complete: { from: ["seated"], to: "completed" },
  no_show: { from: ["confirmed", "requested"], to: "no_show" },
  cancel: { from: ["requested", "confirmed"], to: "cancelled" },
};

/** Confirm, decline, seat, finish, no-show or cancel. Returns the updated reservation. */
export async function moveReservation(ctx: StaffCtx, id: string, action: ReservationAction, reason?: string, now = new Date()): Promise<Reservation> {
  assertCan(ctx);
  const move = MOVES[action];
  const [up] = await ctx.db
    .update(reservations)
    .set({
      status: move.to,
      statusAt: now,
      statusBy: who(ctx.actor),
      updatedAt: now,
      ...(action === "decline" || action === "cancel" ? { reason: reason?.trim().slice(0, 300) || null } : {}),
      ...(action === "cancel" ? { cancelledBy: "business" as const } : {}),
      ...(action === "confirm" ? { checkinHash: sha256(checkinToken(id)) } : {}),
      ...(action === "seat" ? { checkedInAt: now, checkedInBy: who(ctx.actor), checkedInVia: "manual" as const } : {}),
    })
    .where(and(eq(reservations.id, id), eq(reservations.restaurantId, ctx.restaurantId), inArray(reservations.status, move.from)))
    .returning();
  if (!up) {
    const [exists] = await ctx.db.select({ id: reservations.id }).from(reservations).where(and(eq(reservations.id, id), eq(reservations.restaurantId, ctx.restaurantId)));
    if (!exists) throw new NotFoundError();
    throw new ReservationError("transition");
  }
  await writeAudit(ctx.db, ctx.actor, { restaurantId: ctx.restaurantId, action: `reservation.${action}`, entity: "reservation", entityId: id, data: { ref: up.ref } });
  await notify(ctx.db, { k: "reservation", r: ctx.restaurantId });
  return up;
}

/** « Appelé » : the business phoned the customer (shown on the card with who and when). */
export async function markContacted(ctx: StaffCtx, id: string, now = new Date()) {
  assertCan(ctx);
  const [up] = await ctx.db
    .update(reservations)
    .set({ contactedAt: now, contactedBy: who(ctx.actor), updatedAt: now })
    .where(and(eq(reservations.id, id), eq(reservations.restaurantId, ctx.restaurantId)))
    .returning({ ref: reservations.ref });
  if (!up) throw new NotFoundError();
  await writeAudit(ctx.db, ctx.actor, { restaurantId: ctx.restaurantId, action: "reservation.contacted", entity: "reservation", entityId: id, data: { ref: up.ref } });
  await notify(ctx.db, { k: "reservation", r: ctx.restaurantId });
}

/* ------------------------------------------------------------------ check-in by QR */

export class CheckinError extends Error {
  constructor(readonly code: "not_found" | "used" | "expired" | "early" | "not_confirmed", readonly reservation?: Reservation) {
    super(code);
  }
}

/** Who may check guests in: reservation managers, and servers / hosts who serve tables. */
export const canCheckIn = (actor: Actor, restaurantId: string) =>
  can(actor, "reservations.write", { restaurantId }) || can(actor, "orders.serve", { restaurantId }) || can(actor, "orders.confirm", { restaurantId });

/** The reservation behind a scanned check-in QR (this business only). */
export async function reservationByCheckin(db: DB, restaurantId: string | null, token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [row] = await db
    .select()
    .from(reservations)
    .where(and(eq(reservations.checkinHash, sha256(token)), restaurantId ? eq(reservations.restaurantId, restaurantId) : undefined));
  return row ?? null;
}

/** How early a guest may be checked in before the reservation time. */
const EARLY_MINUTES = 180;

/**
 * Staff scan the guest's QR: the reservation becomes « Arrivés » and the QR stops working.
 * Refused when already used, expired (time + expiry minutes), too early, or not confirmed.
 */
export async function checkInByQr(ctx: StaffCtx, r: Pick<Restaurant, "settings">, token: string, now = new Date()): Promise<Reservation> {
  if (!canCheckIn(ctx.actor, ctx.restaurantId)) throw new ForbiddenError();
  const row = await reservationByCheckin(ctx.db, ctx.restaurantId, token);
  if (!row) throw new CheckinError("not_found");
  const cfg = reservationConfig(r);
  if (row.checkedInAt || row.status === "seated" || row.status === "completed") throw new CheckinError("used", row);
  if (row.status !== "confirmed") throw new CheckinError(row.status === "no_show" || row.status === "expired" ? "expired" : "not_confirmed", row);
  if (now.getTime() > expiresAt(row, cfg).getTime()) throw new CheckinError("expired", row);
  if (now.getTime() < Date.parse(`${row.date}T${row.time}:00Z`) - EARLY_MINUTES * 60_000) throw new CheckinError("early", row);
  const [up] = await ctx.db
    .update(reservations)
    .set({ status: "seated", checkedInAt: now, checkedInBy: who(ctx.actor), checkedInVia: "qr", statusAt: now, statusBy: who(ctx.actor), updatedAt: now })
    .where(and(eq(reservations.id, row.id), eq(reservations.status, "confirmed"), isNull(reservations.checkedInAt)))
    .returning();
  // Two phones scanned at the same moment: only one wins.
  if (!up) throw new CheckinError("used", row);
  await writeAudit(ctx.db, ctx.actor, { restaurantId: ctx.restaurantId, action: "reservation.checkin", entity: "reservation", entityId: row.id, data: { ref: row.ref, via: "qr" } });
  await notify(ctx.db, { k: "reservation", r: ctx.restaurantId });
  return up;
}

/**
 * Time passed (reservation time + the business's expiry minutes): a confirmed guest who never
 * came is « Absent » (no-show), a request never answered is « Expirée ». One business or all.
 */
export async function sweepReservations(db: DB, restaurantId?: string, now = new Date()): Promise<number> {
  const res = await db.execute<{ restaurant_id: string }>(sql`
    update reservations v set
      status = case when v.status = 'confirmed' then 'no_show' else 'expired' end,
      status_at = ${now}, status_by = 'system', updated_at = ${now}
    from restaurants x
    where x.id = v.restaurant_id
      and v.status in ('confirmed', 'requested')
      and v.checked_in_at is null
      ${restaurantId ? sql`and v.restaurant_id = ${restaurantId}` : sql``}
      and (v.date::text || ' ' || v.time)::timestamp
          + make_interval(mins => coalesce((x.settings #>> '{reservations,expiryMinutes}')::int, ${RESERVATION_DEFAULTS.expiryMinutes}))
          < (${now}::timestamptz at time zone 'UTC')
    returning v.restaurant_id`);
  for (const rid of new Set(res.rows.map((x) => x.restaurant_id))) await notify(db, { k: "reservation", r: rid });
  return res.rows.length;
}

/* ------------------------------------------------------------------ wait time */

export const WAIT_CHOICES = [10, 15, 20, 30, 45, 60, 90, 120] as const;
export const WAIT_HOURS = [1, 2, 3, 4, 6, 12] as const;
export const WaitInput = z.object({
  minutes: z.coerce.number().int().refine((n) => n === 0 || (WAIT_CHOICES as readonly number[]).includes(n)),
  hours: z.coerce.number().int().refine((n) => (WAIT_HOURS as readonly number[]).includes(n)).default(3),
  note: z.string().trim().max(140).optional(),
});

/** The wait shown to customers right now (null: none, or it ran out). */
export function currentWait(r: Pick<Restaurant, "settings">, now = new Date()): { minutes: number; note: string | null; until: string } | null {
  const w = r.settings.waitTime;
  if (!w || w.minutes <= 0 || Date.parse(w.until) <= now.getTime()) return null;
  return { minutes: w.minutes, note: w.note ?? null, until: w.until };
}

/* ------------------------------------------------------------------ figures */

/** The owner's figures: today (expected, arrived, absent, waiting) and the last 30 days. */
export async function reservationSummary(db: DB, restaurantId: string, now = new Date()) {
  const day = today(now);
  const since = addDays(day, -30);
  const [row] = (
    await db.execute<Record<string, number>>(sql`
      select
        count(*) filter (where date = ${day} and status not in ('declined', 'cancelled'))::int as today_expected,
        coalesce(sum(party_size) filter (where date = ${day} and status not in ('declined', 'cancelled', 'no_show', 'expired')), 0)::int as today_guests,
        count(*) filter (where date = ${day} and checked_in_at is not null)::int as today_arrived,
        count(*) filter (where date = ${day} and status = 'no_show')::int as today_no_show,
        count(*) filter (where date = ${day} and status = 'confirmed')::int as today_to_come,
        count(*) filter (where status = 'requested' and date >= ${day})::int as waiting,
        count(*) filter (where date between ${since} and ${day})::int as total,
        count(*) filter (where date between ${since} and ${day} and checked_in_at is not null)::int as honoured,
        count(*) filter (where date between ${since} and ${day} and checked_in_via = 'qr')::int as by_qr,
        count(*) filter (where date between ${since} and ${day} and status = 'no_show')::int as no_show,
        count(*) filter (where date between ${since} and ${day} and status = 'cancelled')::int as cancelled,
        count(*) filter (where date between ${since} and ${day} and status in ('declined', 'expired'))::int as declined,
        coalesce(sum(party_size) filter (where date between ${since} and ${day} and checked_in_at is not null), 0)::int as guests_honoured
      from reservations where restaurant_id = ${restaurantId}`)
  ).rows;
  const n = (k: string) => Number(row?.[k] ?? 0);
  const honoured = n("honoured");
  const noShow = n("no_show");
  return {
    today: { expected: n("today_expected"), guests: n("today_guests"), arrived: n("today_arrived"), noShow: n("today_no_show"), toCome: n("today_to_come") },
    waiting: n("waiting"),
    last30: {
      total: n("total"),
      honoured,
      byQr: n("by_qr"),
      noShow,
      cancelled: n("cancelled"),
      declined: n("declined"),
      guests: n("guests_honoured"),
      showRate: honoured + noShow > 0 ? Math.round((honoured / (honoured + noShow)) * 100) : null,
    },
  };
}

/** Platform figures (console): reservations made, by state, last 30 days; one business or all. */
export async function reservationStats(db: DB, restaurantId?: string, now = new Date()) {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const rows = await db
    .select({ status: reservations.status, n: sql<number>`count(*)::int`, covers: sql<number>`coalesce(sum(${reservations.partySize}), 0)::int` })
    .from(reservations)
    .where(and(gte(reservations.createdAt, since), restaurantId ? eq(reservations.restaurantId, restaurantId) : undefined))
    .groupBy(reservations.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<ReservationStatus, number>>;
  return { total: rows.reduce((s, r) => s + r.n, 0), covers: rows.reduce((s, r) => s + r.covers, 0), by };
}


