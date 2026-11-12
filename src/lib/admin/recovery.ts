import "server-only";
import { randomInt } from "node:crypto";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { accessCodes, members, recoveryCases, restaurants, staffSessions, supportRequests } from "@/db/schema";
import { normalizeCode } from "@/lib/access-code-format";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/can";
import { env } from "@/lib/env";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { log } from "@/lib/log";
import { hashPin } from "@/lib/personnel/pin";

type AdminActor = Extract<Actor, { kind: "superadmin" }>;

/** Actions are allowed for 30 minutes after a successful check. */
export const CASE_MINUTES = 30;
/** Besides the numéro RC, at least this many of the other answers must match. */
export const MIN_MATCHES = 3;

export const CHECKS = ["name", "city", "phone", "owner", "callback"] as const;
export type Check = (typeof CHECKS)[number] | "rc";

/** Lower case, no accents, no punctuation, single spaces. */
export const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@.]+/g, " ")
    .trim();

/** The last 8 digits (Burkina numbers), so « +226 70 12 34 56 » = « 70123456 ». */
export const phoneKey = (s: string | null | undefined) => {
  const d = (s ?? "").replace(/\D/g, "");
  return d.length >= 8 ? d.slice(-8) : null;
};

export const VerifyInput = z.object({
  callerName: z.string().trim().min(2).max(80),
  callerPhone: z.string().trim().max(30).optional(),
  rc: z.string().trim().min(3).max(20),
  businessName: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  owner: z.string().trim().max(200).optional(),
  callback: z.boolean().optional(),
  note: z.string().trim().max(500).optional(),
});

export async function findBusinessByRc(db: DB, raw: string) {
  const code = normalizeCode(raw);
  if (!code) return null;
  const [r] = await db.select({ id: restaurants.id }).from(accessCodes).innerJoin(restaurants, eq(restaurants.id, accessCodes.restaurantId)).where(and(eq(accessCodes.code, code), isNull(accessCodes.seatId))).limit(1);
  return r?.id ?? null;
}

/**
 * Compares what the caller says with the business's records. The console never shows those
 * records on this screen, so the person checking cannot read the answers out by mistake.
 */
export async function verifyCaller(db: DB, actor: AdminActor, restaurantId: string, raw: unknown, requestId?: string | null) {
  const input = VerifyInput.parse(raw);
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId));
  if (!r) throw new NotFoundError();
  const team = await db.select().from(members).where(eq(members.restaurantId, restaurantId));
  const [main] = await db.select({ code: accessCodes.code }).from(accessCodes).where(and(eq(accessCodes.restaurantId, restaurantId), isNull(accessCodes.seatId))).limit(1);
  const owner = team.find((m) => m.role === "owner");

  const phones = new Set([...r.phones, r.whatsapp, r.orangeMoney, r.moovMoney, r.settings.takeawayWhatsapp, ...team.map((m) => m.phone)].map(phoneKey).filter(Boolean));
  const said = phoneKey(input.phone);
  const ownerSaid = norm(input.owner);
  const checks: Record<Check, boolean> = {
    rc: Boolean(main && normalizeCode(input.rc) === main.code),
    name: Boolean(input.businessName && norm(input.businessName).length >= 3 && (norm(r.name) === norm(input.businessName) || norm(r.name).includes(norm(input.businessName)) || norm(input.businessName).includes(norm(r.name)))),
    city: Boolean(input.city && r.city && norm(input.city) === norm(r.city)),
    phone: Boolean(said && phones.has(said)),
    owner: Boolean(ownerSaid.length >= 3 && owner && (norm(owner.email) === ownerSaid || norm(owner.name) === ownerSaid || (r.settings.ownerEmail ?? "").toLowerCase() === ownerSaid)),
    callback: input.callback === true,
  };
  const score = CHECKS.filter((c) => checks[c]).length;
  const verified = checks.rc && score >= MIN_MATCHES;
  const [c] = await db
    .insert(recoveryCases)
    .values({
      restaurantId,
      requestId: requestId ?? null,
      callerName: input.callerName,
      callerPhone: input.callerPhone || null,
      checks,
      score,
      verified,
      by: actor.email,
      expiresAt: new Date(Date.now() + CASE_MINUTES * 60_000),
      note: input.note || null,
    })
    .returning();
  await writeAudit(db, actor, { restaurantId, action: verified ? "admin.recovery_verified" : "admin.recovery_failed", entity: "recovery_case", entityId: c!.id, data: { checks, score, caller: input.callerName } });
  return c!;
}

async function openCase(db: DB, actor: AdminActor, caseId: string) {
  const [c] = await db.select().from(recoveryCases).where(eq(recoveryCases.id, caseId));
  if (!c) throw new NotFoundError();
  // Only a verified, recent check — and only by the person who did it — unlocks actions.
  if (!c.verified || c.expiresAt < new Date() || c.by !== actor.email) throw new ForbiddenError();
  return c;
}

async function logAction(db: DB, actor: AdminActor, c: typeof recoveryCases.$inferSelect, action: string, target?: string, data?: Record<string, unknown>) {
  await db
    .update(recoveryCases)
    .set({ actions: [...c.actions, { action, at: new Date().toISOString(), target }] })
    .where(eq(recoveryCases.id, c.id));
  await writeAudit(db, actor, { restaurantId: c.restaurantId, action: `admin.recovery.${action}`, entity: "recovery_case", entityId: c.id, data: { target, ...data } });
}

async function caseMember(db: DB, c: { restaurantId: string }, memberId: string) {
  const [m] = await db.select().from(members).where(and(eq(members.id, memberId), eq(members.restaurantId, c.restaurantId)));
  if (!m) throw new NotFoundError();
  return m;
}

/** Clears the 5-wrong-PIN lock. */
export async function unlockPin(db: DB, actor: AdminActor, caseId: string, memberId: string) {
  const c = await openCase(db, actor, caseId);
  const m = await caseMember(db, c, memberId);
  await db.update(members).set({ pinFailures: 0, lockedUntil: null }).where(eq(members.id, m.id));
  await logAction(db, actor, c, "pin_unlocked", m.id);
}

/**
 * A new 6-digit PIN, shown once to the person helping (to read to the caller). Every open PIN
 * session of that person ends: whoever used the old PIN is signed out.
 */
export async function resetPin(db: DB, actor: AdminActor, caseId: string, memberId: string): Promise<string> {
  const c = await openCase(db, actor, caseId);
  const m = await caseMember(db, c, memberId);
  if (m.role === "owner" && m.clerkUserId) throw new ForbiddenError();
  const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.update(members).set({ pinHash: await hashPin(pin), pinFailures: 0, lockedUntil: null }).where(eq(members.id, m.id));
  await db.update(staffSessions).set({ endedAt: new Date() }).where(and(eq(staffSessions.memberId, m.id), isNull(staffSessions.endedAt)));
  await logAction(db, actor, c, "pin_reset", m.id);
  return pin;
}

/**
 * The owner lost access to their sign-in email: the business waits for a new email. The first
 * sign-in with that email, verified by the sign-in provider, becomes the owner, and the old
 * owner account is switched off (kept for history).
 */
export async function setRecoveryOwnerEmail(db: DB, actor: AdminActor, caseId: string, email: string) {
  const c = await openCase(db, actor, caseId);
  const e = z.email().max(200).parse(email.trim().toLowerCase());
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, c.restaurantId));
  if (!r) throw new NotFoundError();
  await db
    .update(restaurants)
    .set({ settings: { ...r.settings, ownerEmail: e, ownerTransfer: true }, updatedAt: new Date() })
    .where(eq(restaurants.id, r.id));
  await logAction(db, actor, c, "owner_email_set", e);
}

/** Clerk locks an account after too many wrong passwords; this lifts it (when Clerk is used). */
export async function unlockSignIn(db: DB, actor: AdminActor, caseId: string, memberId: string): Promise<"done" | "unavailable"> {
  const c = await openCase(db, actor, caseId);
  const m = await caseMember(db, c, memberId);
  if (!m.clerkUserId || !env.clerkConfigured()) return "unavailable";
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    await (await clerkClient()).users.unlockUser(m.clerkUserId);
  } catch (err) {
    log.warn("recovery.clerk_unlock_failed", { error: err instanceof Error ? err.message : String(err) });
    return "unavailable";
  }
  await logAction(db, actor, c, "signin_unlocked", m.id);
  return "done";
}

export async function recoveryContext(db: DB, restaurantId: string) {
  const [r] = await db.select({ id: restaurants.id, name: restaurants.name, city: restaurants.city, slug: restaurants.slug, ownerEmail: restaurants.settings }).from(restaurants).where(eq(restaurants.id, restaurantId));
  if (!r) return null;
  const team = await db
    .select({ id: members.id, name: members.name, email: members.email, role: members.role, staffNo: members.staffNo, active: members.active, hasPin: members.pinHash, lockedUntil: members.lockedUntil, pinFailures: members.pinFailures, clerkUserId: members.clerkUserId })
    .from(members)
    .where(eq(members.restaurantId, restaurantId))
    .orderBy(asc(members.staffNo));
  const cases = await db.select().from(recoveryCases).where(eq(recoveryCases.restaurantId, restaurantId)).orderBy(desc(recoveryCases.createdAt)).limit(10);
  return { r: { id: r.id, name: r.name, city: r.city, slug: r.slug, waitingOwnerEmail: r.ownerEmail.ownerEmail ?? null }, team: team.map((m) => ({ ...m, hasPin: Boolean(m.hasPin) })), cases };
}

export async function linkedRequest(db: DB, id: string) {
  const [r] = await db.select().from(supportRequests).where(eq(supportRequests.id, id));
  return r ?? null;
}
