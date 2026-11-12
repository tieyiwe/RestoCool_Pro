import "server-only";
import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import type { TenantRepo } from "@/db/repos/tenant";
import { accessCodes, attendance, members, restaurants, staffSessions } from "@/db/schema";
import { normalizeCode } from "@/lib/access-codes";
import { writeAudit } from "@/lib/audit";
import { can, type Actor } from "@/lib/auth/can";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { randomToken } from "@/lib/tokens";
import { nextStaffNo } from "./index";
import { roleForNewPerson } from "./roles";

type Restaurant = typeof restaurants.$inferSelect;
export type PersonnelCtx = { db: DB; actor: Actor; repo: TenantRepo };

export { hashPin, LOCK_MINUTES, MAX_PIN_FAILURES, Pin, verifyPin } from "./pin";
import { hashPin, LOCK_MINUTES, MAX_PIN_FAILURES, Pin, verifyPin } from "./pin";

/** Check-in is on unless the owner turned it off (Paramètres → Fonctions). */
export const attendanceEnabled = (r: Pick<Restaurant, "settings">) => r.settings.features?.attendance ?? true;

function need(ctx: PersonnelCtx) {
  if (!can(ctx.actor, "staff.write", { restaurantId: ctx.repo.restaurantId })) throw new ForbiddenError();
}

async function actingMemberId(ctx: PersonnelCtx): Promise<string | null> {
  if (ctx.actor.kind !== "member") return null;
  if (ctx.actor.memberId) return ctx.actor.memberId;
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
  // Count the try before checking the PIN, in one atomic update: parallel requests cannot all read
  // the same failure count and get more than MAX_PIN_FAILURES guesses. The last allowed try locks
  // the profile up front; a right PIN clears it again.
  const attempt = await reservePinAttempt(db, m.id, now);
  if (!attempt) {
    const fresh = await db.query.members.findFirst({ columns: { lockedUntil: true }, where: eq(members.id, m.id) });
    const until = fresh?.lockedUntil?.getTime() ?? now.getTime() + LOCK_MINUTES * 60_000;
    return { ok: false, error: "locked", minutesLeft: Math.max(1, Math.ceil((until - now.getTime()) / 60_000)) };
  }
  if (!(await verifyPin(pin, m.pinHash))) {
    const lock = attempt.failures >= MAX_PIN_FAILURES;
    await writeAudit(db, actor, { restaurantId: r.id, action: lock ? "attendance.pin.locked" : "attendance.pin.wrong", entity: "member", entityId: m.id, data: { method } });
    return lock ? { ok: false, error: "locked", minutesLeft: LOCK_MINUTES } : { ok: false, error: "wrong_pin", triesLeft: MAX_PIN_FAILURES - attempt.failures };
  }
  await db.update(members).set({ pinFailures: 0, lockedUntil: null }).where(eq(members.id, m.id));
  const result = await toggle(db, r.id, m.id, method, null, now);
  await writeAudit(db, actor, { restaurantId: r.id, action: `attendance.${result.action}`, entity: "member", entityId: m.id, data: { method } });
  return { ok: true, name: m.name ?? "—", staffNo: m.staffNo ?? 0, ...result };
}

/**
 * Takes one PIN try for this person, or null when they are locked. An expired lock starts a
 * fresh count. Reaching MAX_PIN_FAILURES sets the lock in the same statement.
 */
export async function reservePinAttempt(db: DB, memberId: string, now: Date): Promise<{ failures: number } | null> {
  const lockUntil = new Date(now.getTime() + LOCK_MINUTES * 60_000);
  const count = sql`(case when ${members.lockedUntil} is not null and ${members.lockedUntil} <= ${now} then 0 else ${members.pinFailures} end) + 1`;
  const [row] = await db
    .update(members)
    .set({
      pinFailures: count,
      lockedUntil: sql`case when ${count} >= ${MAX_PIN_FAILURES} then ${lockUntil}::timestamptz else null end`,
    })
    .where(and(eq(members.id, memberId), or(isNull(members.lockedUntil), lte(members.lockedUntil, now))))
    .returning({ failures: members.pinFailures });
  return row ?? null;
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
  /** The job role (« Serveur·se », « Plongeur·se »…); its access decides what the person opens. */
  jobRoleId: z.uuid(),
  pin: Pin,
});

/** Adds a person who has no email (any job role): they get the next matricule and a PIN. */
export async function addPerson(ctx: PersonnelCtx, input: z.input<typeof NewPersonInput>) {
  need(ctx);
  const d = NewPersonInput.parse(input);
  const rid = ctx.repo.restaurantId;
  const role = await roleForNewPerson(ctx, d.jobRoleId);
  const pinHash = await hashPin(d.pin);
  const row = await ctx.db.transaction(async (tx) => {
    const staffNo = await nextStaffNo(tx, rid);
    const [m] = await tx.insert(members).values({ restaurantId: rid, clerkUserId: null, name: d.name, role: role.level, jobRoleId: role.id, staffNo, pinHash }).returning();
    await writeAudit(tx, ctx.actor, { restaurantId: rid, action: "personnel.added", entity: "member", entityId: m!.id, data: { role: role.level, jobRoleId: role.id, staffNo } });
    return m!;
  });
  return { id: row.id, staffNo: row.staffNo! };
}

/**
 * Managers handle the personnel; only the owner (managers.write) may change a manager's or the
 * owner's PIN or status (a manager may set their own PIN), so a manager cannot deactivate or
 * take the check-in identity of another manager or the owner.
 */
async function managedMember(ctx: PersonnelCtx, memberId: string, opts: { allowSelf?: boolean } = {}) {
  const m = await ctx.db.query.members.findFirst({ where: and(eq(members.restaurantId, ctx.repo.restaurantId), eq(members.id, memberId)) });
  if (!m) throw new NotFoundError();
  const self = ctx.actor.kind === "member" && (m.id === ctx.actor.memberId || (m.clerkUserId !== null && m.clerkUserId === ctx.actor.userId));
  const lead = m.role === "owner" || m.role === "manager";
  if (lead && !(opts.allowSelf && self) && !can(ctx.actor, "managers.write", { restaurantId: ctx.repo.restaurantId })) throw new ForbiddenError();
  return m;
}

export async function setPin(ctx: PersonnelCtx, memberId: string, pin: string) {
  need(ctx);
  const p = Pin.parse(pin);
  // Anyone who manages the personnel may set their own PIN.
  const m = await managedMember(ctx, memberId, { allowSelf: true });
  const done = await ctx.db
    .update(members)
    .set({ pinHash: await hashPin(p), pinFailures: 0, lockedUntil: null })
    .where(and(eq(members.restaurantId, ctx.repo.restaurantId), eq(members.id, m.id)))
    .returning({ id: members.id });
  if (!done.length) throw new NotFoundError();
  await writeAudit(ctx.db, ctx.actor, { restaurantId: ctx.repo.restaurantId, action: "personnel.pin.set", entity: "member", entityId: memberId });
}

export async function setActive(ctx: PersonnelCtx, memberId: string, active: boolean) {
  need(ctx);
  const m = await managedMember(ctx, memberId);
  // The owner stays: a restaurant always keeps its owner.
  if (m.role === "owner") throw new ForbiddenError();
  await ctx.db.update(members).set({ active }).where(eq(members.id, m.id));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: ctx.repo.restaurantId, action: active ? "personnel.activated" : "personnel.deactivated", entity: "member", entityId: m.id });
}

/**
 * Someone left the business: access closed at once (PIN, account, tablet sessions), an open
 * check-in is closed, and they move to « Anciens employés » with their history. Reversible.
 */
export async function archivePerson(ctx: PersonnelCtx, memberId: string, reason?: string) {
  need(ctx);
  const m = await managedMember(ctx, memberId);
  if (m.role === "owner") throw new ForbiddenError();
  const now = new Date();
  await ctx.db.transaction(async (tx) => {
    await tx.update(members).set({ active: false, archivedAt: now, archivedReason: reason?.trim().slice(0, 200) || null }).where(eq(members.id, m.id));
    await tx.update(staffSessions).set({ endedAt: now }).where(and(eq(staffSessions.memberId, m.id), isNull(staffSessions.endedAt)));
    await tx.update(attendance).set({ checkOutAt: now, outMethod: "manager", outBy: ctx.actor.kind === "member" ? (ctx.actor.memberId ?? null) : null }).where(and(eq(attendance.memberId, m.id), isNull(attendance.checkOutAt)));
    await writeAudit(tx, ctx.actor, { restaurantId: ctx.repo.restaurantId, action: "personnel.archived", entity: "member", entityId: m.id, data: { reason: reason ?? null } });
  });
}

/** Back in the team (same matricule); a new PIN may be needed. */
export async function restorePerson(ctx: PersonnelCtx, memberId: string) {
  need(ctx);
  const m = await managedMember(ctx, memberId);
  if (m.erasedAt) throw new ForbiddenError();
  await ctx.db.update(members).set({ active: true, archivedAt: null, archivedReason: null }).where(eq(members.id, m.id));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: ctx.repo.restaurantId, action: "personnel.restored", entity: "member", entityId: m.id });
}

/**
 * Erase a former employee's personal data (name, phone, email, PIN, login). The matricule and
 * the anonymous history (orders handled, hours) stay, so reports remain right. Not reversible.
 */
export async function erasePerson(ctx: PersonnelCtx, memberId: string) {
  need(ctx);
  const m = await managedMember(ctx, memberId);
  if (m.role === "owner" || !m.archivedAt) throw new ForbiddenError();
  await ctx.db
    .update(members)
    .set({ name: `Ancien employé ${String(m.staffNo ?? 0).padStart(3, "0")}`, phone: null, email: null, pinHash: null, clerkUserId: null, archivedReason: null, erasedAt: new Date() })
    .where(eq(members.id, m.id));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: ctx.repo.restaurantId, action: "personnel.erased", entity: "member", entityId: m.id });
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
