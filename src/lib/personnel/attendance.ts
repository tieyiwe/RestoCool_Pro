import "server-only";
import { and, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import type { TenantRepo } from "@/db/repos/tenant";
import { accessCodes, attendance, members, restaurants } from "@/db/schema";
import { normalizeCode } from "@/lib/access-codes";
import { writeAudit } from "@/lib/audit";
import { can, type Actor } from "@/lib/auth/can";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { randomToken } from "@/lib/tokens";
import { nextStaffNo } from "./index";

type Restaurant = typeof restaurants.$inferSelect;
export type PersonnelCtx = { db: DB; actor: Actor; repo: TenantRepo };

export { hashPin, LOCK_MINUTES, MAX_PIN_FAILURES, Pin, verifyPin } from "./pin";
import { hashPin, LOCK_MINUTES, MAX_PIN_FAILURES, Pin, verifyPin } from "./pin";

/** Check-in is on unless the owner turned it off (Paramètres → Fonctions). */
export const attendanceEnabled = (r: Pick<Restaurant, "settings">) => r.settings.features?.attendance ?? true;

function need(ctx: PersonnelCtx) {
  if (!can(ctx.actor, "staff.write", { restaurantId: ctx.repo.restaurantId })) throw new ForbiddenError();
}

/** The owner and managers are « managers.write » (owner only): a manager can't lock them out or set their PIN. */
function needForTarget(ctx: PersonnelCtx, target: { role: string }) {
  need(ctx);
  if ((target.role === "owner" || target.role === "manager") && !can(ctx.actor, "managers.write", { restaurantId: ctx.repo.restaurantId })) throw new ForbiddenError();
}

async function actingMemberId(ctx: PersonnelCtx): Promise<string | null> {
  if (ctx.actor.kind !== "member") return null;
  const [m] = await ctx.db.select({ id: members.id }).from(members).where(and(eq(members.restaurantId, ctx.repo.restaurantId), eq(members.clerkUserId, ctx.actor.userId))).limit(1);
  return m?.id ?? null;
}

/* ---------------------------------------------------------------- the check-in QR */

/** Secret of the restaurant's check-in QR, created on first use. */
export async function ensureAttendanceToken(db: DB, r: Restaurant): Promise<string> {
  if (r.settings.attendanceToken) return r.settings.attendanceToken;
  const token = randomToken();
  await db
    .update(restaurants)
    .set({ settings: sql`${restaurants.settings} || ${JSON.stringify({ attendanceToken: token })}::jsonb` })
    .where(and(eq(restaurants.id, r.id), sql`not (${restaurants.settings} ? 'attendanceToken')`));
  const fresh = await db.query.restaurants.findFirst({ where: eq(restaurants.id, r.id) });
  return fresh!.settings.attendanceToken!;
}

/** New QR (the old printed one stops working), e.g. if it was photographed and shared. */
export async function regenerateAttendanceToken(ctx: PersonnelCtx) {
  need(ctx);
  await ctx.db
    .update(restaurants)
    .set({ settings: sql`${restaurants.settings} || ${JSON.stringify({ attendanceToken: randomToken() })}::jsonb` })
    .where(eq(restaurants.id, ctx.repo.restaurantId));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: ctx.repo.restaurantId, action: "attendance.qr.regenerated", entity: "restaurant", entityId: ctx.repo.restaurantId });
}

/** Restaurant of a check-in kiosk: from the QR's token, or from its numéro RC. */
export async function kioskRestaurant(db: DB, by: { token: string } | { rc: string }): Promise<Restaurant | null> {
  if ("token" in by) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(by.token)) return null;
    return (await db.query.restaurants.findFirst({ where: sql`${restaurants.settings}->>'attendanceToken' = ${by.token}` })) ?? null;
  }
  const code = normalizeCode(by.rc);
  if (!code) return null;
  const [hit] = await db.select({ id: accessCodes.restaurantId }).from(accessCodes).where(eq(accessCodes.code, code)).limit(1);
  return hit ? ((await db.query.restaurants.findFirst({ where: eq(restaurants.id, hit.id) })) ?? null) : null;
}

/* ---------------------------------------------------------------- punching in / out */

export type PunchResult =
  | { ok: true; action: "in" | "out"; name: string; staffNo: number; at: Date; minutes: number | null }
  | { ok: false; error: "disabled" | "unknown" | "no_pin" | "wrong_pin" | "locked"; minutesLeft?: number; triesLeft?: number };

/**
 * A person checks in or out with their matricule + PIN (on the kiosk). The same code toggles:
 * not checked in → arrival; checked in → departure. 5 wrong PINs lock the profile 10 minutes.
 */
export async function punch(db: DB, r: Restaurant, staffNo: number, pin: string, method: "qr" | "code", now = new Date()): Promise<PunchResult> {
  if (!attendanceEnabled(r)) return { ok: false, error: "disabled" };
  const m = await db.query.members.findFirst({ where: and(eq(members.restaurantId, r.id), eq(members.staffNo, staffNo), eq(members.active, true)) });
  if (!m) return { ok: false, error: "unknown" };
  if (m.lockedUntil && m.lockedUntil > now) return { ok: false, error: "locked", minutesLeft: Math.ceil((m.lockedUntil.getTime() - now.getTime()) / 60_000) };
  if (!m.pinHash) return { ok: false, error: "no_pin" };
  const actor: Actor = { kind: "staff", staffId: m.id, restaurantId: r.id, role: m.role === "kitchen" || m.role === "cashier" ? m.role : "server" };
  if (!(await verifyPin(pin, m.pinHash))) {
    const failures = m.pinFailures + 1;
    const lock = failures >= MAX_PIN_FAILURES;
    await db
      .update(members)
      .set({ pinFailures: lock ? 0 : failures, lockedUntil: lock ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : m.lockedUntil })
      .where(eq(members.id, m.id));
    await writeAudit(db, actor, { restaurantId: r.id, action: lock ? "attendance.pin.locked" : "attendance.pin.wrong", entity: "member", entityId: m.id, data: { method } });
    return lock ? { ok: false, error: "locked", minutesLeft: LOCK_MINUTES } : { ok: false, error: "wrong_pin", triesLeft: MAX_PIN_FAILURES - failures };
  }
  if (m.pinFailures) await db.update(members).set({ pinFailures: 0 }).where(eq(members.id, m.id));
  const result = await toggle(db, r.id, m.id, method, null, now);
  await writeAudit(db, actor, { restaurantId: r.id, action: `attendance.${result.action}`, entity: "member", entityId: m.id, data: { method } });
  return { ok: true, name: m.name ?? "—", staffNo: m.staffNo ?? 0, ...result };
}

async function toggle(db: DB, restaurantId: string, memberId: string, method: "qr" | "code" | "manager", by: string | null, now: Date, force?: "in" | "out") {
  return db.transaction(async (tx) => {
    const [open] = await tx
      .select()
      .from(attendance)
      .where(and(eq(attendance.restaurantId, restaurantId), eq(attendance.memberId, memberId), isNull(attendance.checkOutAt)))
      .for("update");
    if (open && force !== "in") {
      await tx.update(attendance).set({ checkOutAt: now, outMethod: method, outBy: by, updatedAt: now }).where(eq(attendance.id, open.id));
      return { action: "out" as const, at: now, minutes: Math.round((now.getTime() - open.checkInAt.getTime()) / 60_000) };
    }
    if (open) return { action: "in" as const, at: open.checkInAt, minutes: null };
    if (force === "out") throw new NotFoundError();
    await tx.insert(attendance).values({ restaurantId, memberId, checkInAt: now, inMethod: method, inBy: by });
    return { action: "in" as const, at: now, minutes: null };
  });
}

/** The owner/manager checks someone in or out (they forgot, or have no phone). */
export async function managerPunch(ctx: PersonnelCtx, memberId: string, action: "in" | "out", now = new Date()) {
  need(ctx);
  const m = await ctx.db.query.members.findFirst({ where: and(eq(members.restaurantId, ctx.repo.restaurantId), eq(members.id, memberId)) });
  if (!m) throw new NotFoundError();
  const by = await actingMemberId(ctx);
  const res = await toggle(ctx.db, ctx.repo.restaurantId, m.id, "manager", by, now, action);
  await writeAudit(ctx.db, ctx.actor, { restaurantId: ctx.repo.restaurantId, action: `attendance.${action}.manager`, entity: "member", entityId: m.id });
  return res;
}

/* ---------------------------------------------------------------- personnel without email */

export const NewPersonInput = z.object({
  name: z.string().trim().min(2).max(60),
  role: z.enum(["server", "kitchen", "cashier"]),
  pin: Pin,
});

/** Adds a server, cook or cashier who has no email: they get the next matricule and a PIN. */
export async function addPerson(ctx: PersonnelCtx, input: z.input<typeof NewPersonInput>) {
  need(ctx);
  const d = NewPersonInput.parse(input);
  const rid = ctx.repo.restaurantId;
  const pinHash = await hashPin(d.pin);
  const row = await ctx.db.transaction(async (tx) => {
    const staffNo = await nextStaffNo(tx, rid);
    const [m] = await tx.insert(members).values({ restaurantId: rid, clerkUserId: null, name: d.name, role: d.role, staffNo, pinHash }).returning();
    await writeAudit(tx, ctx.actor, { restaurantId: rid, action: "personnel.added", entity: "member", entityId: m!.id, data: { role: d.role, staffNo } });
    return m!;
  });
  return { id: row.id, staffNo: row.staffNo! };
}

export async function setPin(ctx: PersonnelCtx, memberId: string, pin: string) {
  need(ctx);
  const p = Pin.parse(pin);
  const m = await ctx.db.query.members.findFirst({ where: and(eq(members.restaurantId, ctx.repo.restaurantId), eq(members.id, memberId)), columns: { role: true } });
  if (!m) throw new NotFoundError();
  needForTarget(ctx, m);
  const done = await ctx.db
    .update(members)
    .set({ pinHash: await hashPin(p), pinFailures: 0, lockedUntil: null })
    .where(and(eq(members.restaurantId, ctx.repo.restaurantId), eq(members.id, memberId)))
    .returning({ id: members.id });
  if (!done.length) throw new NotFoundError();
  await writeAudit(ctx.db, ctx.actor, { restaurantId: ctx.repo.restaurantId, action: "personnel.pin.set", entity: "member", entityId: memberId });
}

export async function setActive(ctx: PersonnelCtx, memberId: string, active: boolean) {
  need(ctx);
  const m = await ctx.db.query.members.findFirst({ where: and(eq(members.restaurantId, ctx.repo.restaurantId), eq(members.id, memberId)) });
  if (!m) throw new NotFoundError();
  // The owner stays: a restaurant always keeps its owner.
  if (m.role === "owner") throw new ForbiddenError();
  // Removing a manager is the owner's call (managers.write), not another manager's.
  needForTarget(ctx, m);
  await ctx.db.update(members).set({ active }).where(eq(members.id, m.id));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: ctx.repo.restaurantId, action: active ? "personnel.activated" : "personnel.deactivated", entity: "member", entityId: m.id });
}

/* ---------------------------------------------------------------- reading */

export type AttendanceRow = { id: string; memberId: string; checkInAt: Date; checkOutAt: Date | null; inMethod: string; outMethod: string | null; minutes: number };

/** Records of the last `days` days (and anything still open), newest first. */
export async function attendanceLog(db: DB, restaurantId: string, days = 7, now = new Date()): Promise<AttendanceRow[]> {
  const since = new Date(now);
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const rows = await db
    .select()
    .from(attendance)
    .where(and(eq(attendance.restaurantId, restaurantId), or(gte(attendance.checkInAt, since), isNull(attendance.checkOutAt))))
    .orderBy(desc(attendance.checkInAt))
    .limit(500);
  return rows.map((r) => ({
    id: r.id,
    memberId: r.memberId,
    checkInAt: r.checkInAt,
    checkOutAt: r.checkOutAt,
    inMethod: r.inMethod,
    outMethod: r.outMethod,
    minutes: Math.max(0, Math.round(((r.checkOutAt ?? now).getTime() - r.checkInAt.getTime()) / 60_000)),
  }));
}
