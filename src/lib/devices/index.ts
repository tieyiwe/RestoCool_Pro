import "server-only";
import { and, asc, eq, isNull, isNotNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { devices, jobRoles, members, restaurants, staffSessions } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { cleanAccess } from "@/lib/auth/access";
import { can, type Actor } from "@/lib/auth/can";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { LOCK_MINUTES, MAX_PIN_FAILURES, reservePinAttempt, verifyPin } from "@/lib/personnel/attendance";
import { assertPlan } from "@/lib/plan";
import { randomToken, sha256 } from "@/lib/tokens";

/** Long-lived cookie of an authorised device, and the cookie of the person logged in on it. */
export const DEVICE_COOKIE = "rc_device";
export const STAFF_COOKIE = "rc_staff";

export const DEFAULT_STAFF_SESSION = { shiftHours: 12, idleMinutes: 15 } as const;

type Restaurant = typeof restaurants.$inferSelect;
export type DeviceCtx = { db: DB; actor: Actor; restaurantId: string };

export function staffSessionSettings(r: Pick<Restaurant, "settings">) {
  const s = r.settings.staffSessions;
  return {
    shiftHours: Math.min(24, Math.max(1, s?.shiftHours ?? DEFAULT_STAFF_SESSION.shiftHours)),
    idleMinutes: Math.min(240, Math.max(1, s?.idleMinutes ?? DEFAULT_STAFF_SESSION.idleMinutes)),
  };
}

function need(ctx: DeviceCtx) {
  if (!can(ctx.actor, "devices.write", { restaurantId: ctx.restaurantId })) throw new ForbiddenError();
}

/* ---------------------------------------------------------------- devices (owner / manager) */

export const DeviceName = z.string().trim().min(2).max(40);

/** « Autoriser cet appareil »: returns the secret the browser keeps (shown nowhere else). */
export async function authorizeDevice(ctx: DeviceCtx, name: string, authorizedBy: string | null) {
  need(ctx);
  const r = await ctx.db.query.restaurants.findFirst({ where: eq(restaurants.id, ctx.restaurantId) });
  if (!r) throw new NotFoundError();
  assertPlan(r, "staff");
  const token = randomToken(32);
  const [d] = await ctx.db
    .insert(devices)
    .values({ restaurantId: ctx.restaurantId, name: DeviceName.parse(name), tokenHash: sha256(token), authorizedBy, lastSeenAt: new Date() })
    .returning();
  await writeAudit(ctx.db, ctx.actor, { restaurantId: ctx.restaurantId, action: "device.authorized", entity: "device", entityId: d!.id, data: { name: d!.name } });
  return { device: d!, token };
}

export async function listDevices(db: DB, restaurantId: string) {
  return db
    .select({
      id: devices.id,
      name: devices.name,
      lastSeenAt: devices.lastSeenAt,
      revokedAt: devices.revokedAt,
      createdAt: devices.createdAt,
      authorizedByName: members.name,
      openSessions: sql<number>`(select count(*)::int from ${staffSessions} s where s.device_id = ${devices.id} and s.ended_at is null and s.expires_at > now())`,
    })
    .from(devices)
    .leftJoin(members, eq(members.id, devices.authorizedBy))
    .where(eq(devices.restaurantId, restaurantId))
    .orderBy(asc(devices.revokedAt), asc(devices.createdAt));
}

/** Stops a device at once: its cookie no longer works and everyone logged in on it is logged out. */
export async function revokeDevice(ctx: DeviceCtx, deviceId: string) {
  need(ctx);
  const now = new Date();
  const done = await ctx.db
    .update(devices)
    .set({ revokedAt: now })
    .where(and(eq(devices.id, deviceId), eq(devices.restaurantId, ctx.restaurantId), isNull(devices.revokedAt)))
    .returning({ id: devices.id });
  if (!done.length) throw new NotFoundError();
  await ctx.db.update(staffSessions).set({ endedAt: now }).where(and(eq(staffSessions.deviceId, deviceId), isNull(staffSessions.endedAt)));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: ctx.restaurantId, action: "device.revoked", entity: "device", entityId: deviceId });
}

/** The authorised device behind a cookie (never a revoked one), and its business. */
export async function deviceFromToken(db: DB, token: string | undefined) {
  if (!token || token.length < 20 || token.length > 200) return null;
  const [row] = await db
    .select({ device: devices, restaurant: restaurants })
    .from(devices)
    .innerJoin(restaurants, eq(restaurants.id, devices.restaurantId))
    .where(and(eq(devices.tokenHash, sha256(token)), isNull(devices.revokedAt)))
    .limit(1);
  if (!row) return null;
  if (!row.device.lastSeenAt || Date.now() - row.device.lastSeenAt.getTime() > 5 * 60_000) {
    await db.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.id, row.device.id));
  }
  return row;
}

/* ---------------------------------------------------------------- the PIN pad (on the device) */

/** People who can log in on the device: active, with a PIN; never the owner (they use their account). */
export async function deviceTeam(db: DB, restaurantId: string) {
  return db
    .select({ id: members.id, name: members.name, staffNo: members.staffNo, role: members.role, jobRoleKey: jobRoles.key, jobRoleName: jobRoles.name, lockedUntil: members.lockedUntil })
    .from(members)
    .leftJoin(jobRoles, eq(jobRoles.id, members.jobRoleId))
    .where(and(eq(members.restaurantId, restaurantId), eq(members.active, true), isNotNull(members.pinHash), ne(members.role, "owner")))
    .orderBy(asc(members.staffNo));
}

export type PinLoginResult =
  | { ok: true; token: string; memberId: string; name: string }
  | { ok: false; error: "unknown" | "wrong_pin" | "locked"; triesLeft?: number; minutesLeft?: number };

/** A person types their PIN on an authorised device: 5 wrong PINs lock them 10 minutes (shared with check-in). */
export async function pinLogin(db: DB, device: { id: string; restaurantId: string }, r: Pick<Restaurant, "settings">, memberId: string, pin: string, now = new Date()): Promise<PinLoginResult> {
  if (!z.uuid().safeParse(memberId).success) return { ok: false, error: "unknown" };
  const m = await db.query.members.findFirst({ where: and(eq(members.id, memberId), eq(members.restaurantId, device.restaurantId), eq(members.active, true)) });
  if (!m || !m.pinHash || m.role === "owner") return { ok: false, error: "unknown" };
  const actor: Actor = { kind: "member", userId: `pin:${m.id}`, restaurantId: device.restaurantId, role: m.role, memberId: m.id, via: "pin" };
  if (m.lockedUntil && m.lockedUntil > now) return { ok: false, error: "locked", minutesLeft: Math.ceil((m.lockedUntil.getTime() - now.getTime()) / 60_000) };
  const attempt = await reservePinAttempt(db, m.id, now);
  if (!attempt) return { ok: false, error: "locked", minutesLeft: LOCK_MINUTES };
  if (!(await verifyPin(pin, m.pinHash))) {
    const lock = attempt.failures >= MAX_PIN_FAILURES;
    await writeAudit(db, actor, { restaurantId: device.restaurantId, action: lock ? "staff.login.locked" : "staff.login.wrong_pin", entity: "device", entityId: device.id });
    return lock ? { ok: false, error: "locked", minutesLeft: LOCK_MINUTES } : { ok: false, error: "wrong_pin", triesLeft: MAX_PIN_FAILURES - attempt.failures };
  }
  await db.update(members).set({ pinFailures: 0, lockedUntil: null }).where(eq(members.id, m.id));
  const { shiftHours } = staffSessionSettings(r);
  const token = randomToken(32);
  // One person at a time on a device: whoever was logged in is logged out.
  await db.update(staffSessions).set({ endedAt: now }).where(and(eq(staffSessions.deviceId, device.id), isNull(staffSessions.endedAt)));
  await db.insert(staffSessions).values({
    restaurantId: device.restaurantId,
    deviceId: device.id,
    memberId: m.id,
    tokenHash: sha256(token),
    expiresAt: new Date(now.getTime() + shiftHours * 3600_000),
    lastActivityAt: now,
  });
  await writeAudit(db, actor, { restaurantId: device.restaurantId, action: "staff.login", entity: "device", entityId: device.id });
  return { ok: true, token, memberId: m.id, name: m.name ?? "—" };
}

/**
 * The person logged in on this device, if their session is still good: not locked, not past the
 * end of the shift, not idle for longer than allowed, device not revoked, person still active.
 * An idle or expired session is ended here (the server decides, not the browser).
 */
export async function sessionFromToken(db: DB, token: string | undefined, now = new Date(), opts: { passive?: boolean } = {}) {
  if (!token || token.length < 20 || token.length > 200) return null;
  const [row] = await db
    .select({ session: staffSessions, device: devices, member: members, restaurant: restaurants, access: jobRoles.access })
    .from(staffSessions)
    .innerJoin(devices, eq(devices.id, staffSessions.deviceId))
    .innerJoin(members, eq(members.id, staffSessions.memberId))
    .innerJoin(restaurants, eq(restaurants.id, staffSessions.restaurantId))
    .leftJoin(jobRoles, and(eq(jobRoles.id, members.jobRoleId), eq(jobRoles.restaurantId, members.restaurantId)))
    .where(eq(staffSessions.tokenHash, sha256(token)))
    .limit(1);
  if (!row || row.session.endedAt) return null;
  const { idleMinutes } = staffSessionSettings(row.restaurant);
  const idle = now.getTime() - row.session.lastActivityAt.getTime() > idleMinutes * 60_000;
  const valid =
    !row.device.revokedAt &&
    row.device.restaurantId === row.session.restaurantId &&
    row.member.restaurantId === row.session.restaurantId &&
    row.member.active &&
    row.member.role !== "owner" &&
    !row.restaurant.deletedAt &&
    row.session.expiresAt > now &&
    !idle;
  if (!valid) {
    await db.update(staffSessions).set({ endedAt: now }).where(and(eq(staffSessions.id, row.session.id), isNull(staffSessions.endedAt)));
    if (idle) await writeAudit(db, null, { restaurantId: row.session.restaurantId, action: "staff.locked.idle", entity: "device", entityId: row.device.id, data: { memberId: row.member.id } });
    return null;
  }
  // Background requests (heartbeat, notification polling) are not someone using the tablet.
  if (!opts.passive && now.getTime() - row.session.lastActivityAt.getTime() > 30_000) {
    await db.update(staffSessions).set({ lastActivityAt: now }).where(eq(staffSessions.id, row.session.id));
  }
  return { ...row, access: row.access ? cleanAccess(row.access) : null, idleMinutes };
}

/** « Verrouiller »: ends the session on this device. */
export async function endSession(db: DB, token: string | undefined, reason: "lock" | "idle" = "lock") {
  if (!token) return;
  const [s] = await db
    .update(staffSessions)
    .set({ endedAt: new Date() })
    .where(and(eq(staffSessions.tokenHash, sha256(token)), isNull(staffSessions.endedAt)))
    .returning();
  if (s) {
    const actor: Actor = { kind: "member", userId: `pin:${s.memberId}`, restaurantId: s.restaurantId, role: "server", memberId: s.memberId, via: "pin" };
    await writeAudit(db, actor, { restaurantId: s.restaurantId, action: reason === "idle" ? "staff.locked.idle" : "staff.logout", entity: "device", entityId: s.deviceId });
  }
}
