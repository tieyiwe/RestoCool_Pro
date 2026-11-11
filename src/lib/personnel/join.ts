import "server-only";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { joinRequests, members, restaurants } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { can } from "@/lib/auth/can";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { normalizeBfPhone } from "@/lib/format";
import { notify } from "@/lib/realtime/events";
import { randomToken, safeEqual, sha256 } from "@/lib/tokens";
import { hashPin, Pin, type PersonnelCtx } from "./attendance";
import { nextStaffNo } from "./index";
import { roleForNewPerson } from "./roles";

type Restaurant = typeof restaurants.$inferSelect;

/** At most this many people waiting at once per business (a shared QR can't flood the owner). */
export const MAX_PENDING = 30;

/* ---------------------------------------------------------------- the team QR */

export async function ensureJoinToken(db: DB, r: Restaurant): Promise<string> {
  if (r.settings.joinToken) return r.settings.joinToken;
  await db
    .update(restaurants)
    .set({ settings: sql`${restaurants.settings} || ${JSON.stringify({ joinToken: randomToken() })}::jsonb` })
    .where(and(eq(restaurants.id, r.id), sql`not (${restaurants.settings} ? 'joinToken')`));
  const fresh = await db.query.restaurants.findFirst({ where: eq(restaurants.id, r.id) });
  return fresh!.settings.joinToken!;
}

function needStaff(ctx: PersonnelCtx) {
  if (!can(ctx.actor, "staff.write", { restaurantId: ctx.repo.restaurantId })) throw new ForbiddenError();
}

/** New team QR: the old one stops working (e.g. a photo of it was shared). */
export async function regenerateJoinToken(ctx: PersonnelCtx) {
  needStaff(ctx);
  await ctx.db
    .update(restaurants)
    .set({ settings: sql`${restaurants.settings} || ${JSON.stringify({ joinToken: randomToken() })}::jsonb` })
    .where(eq(restaurants.id, ctx.repo.restaurantId));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: ctx.repo.restaurantId, action: "join.qr.regenerated", entity: "restaurant", entityId: ctx.repo.restaurantId });
}

export async function restaurantByJoinToken(db: DB, token: string): Promise<Restaurant | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  return (await db.query.restaurants.findFirst({ where: sql`${restaurants.settings}->>'joinToken' = ${token}` })) ?? null;
}

/* ---------------------------------------------------------------- the person's side */

/** Burkina numbers (+226) or any international number written with its country code. */
export function normalizeJoinPhone(input: string): string | null {
  const bf = normalizeBfPhone(input);
  if (bf) return bf;
  const d = input.replace(/\D/g, "").replace(/^00/, "");
  return input.trim().startsWith("+") || input.trim().startsWith("00") ? (/^\d{8,15}$/.test(d) ? d : null) : null;
}

export const JoinInput = z.object({
  name: z.string().trim().min(3).max(60),
  phone: z.string().trim().max(30).transform((v, c) => normalizeJoinPhone(v) ?? (c.addIssue({ code: "custom", message: "phone" }), z.NEVER)),
  pin: Pin,
});

export type JoinError = "invalid" | "phone" | "full" | "closed";
export class JoinRequestError extends Error {
  constructor(public readonly code: JoinError) {
    super(code);
  }
}

/**
 * Sends the request. Returns its id and the secret the person's phone keeps to follow it.
 * A second request with the same phone replaces the waiting one (no duplicates for the owner).
 */
export async function submitJoinRequest(db: DB, r: Restaurant, input: z.input<typeof JoinInput>) {
  const p = JoinInput.safeParse(input);
  if (!p.success) throw new JoinRequestError(p.error.issues.some((i) => i.message === "phone") ? "phone" : "invalid");
  const d = p.data;
  const secret = randomToken();
  const pinHash = await hashPin(d.pin);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`join:${r.id}`}))`);
    // Already in the team with this phone: nothing to approve.
    const [already] = await tx.select({ id: members.id }).from(members).where(and(eq(members.restaurantId, r.id), eq(members.phone, d.phone), eq(members.active, true))).limit(1);
    if (already) throw new JoinRequestError("closed");
    await tx.delete(joinRequests).where(and(eq(joinRequests.restaurantId, r.id), eq(joinRequests.phone, d.phone), eq(joinRequests.status, "pending")));
    const [{ n }] = (await tx.select({ n: count() }).from(joinRequests).where(and(eq(joinRequests.restaurantId, r.id), eq(joinRequests.status, "pending")))) as [{ n: number }];
    if (n >= MAX_PENDING) throw new JoinRequestError("full");
    const [row] = await tx
      .insert(joinRequests)
      .values({ restaurantId: r.id, name: d.name, phone: d.phone, pinHash, secretHash: sha256(secret) })
      .returning({ id: joinRequests.id });
    await writeAudit(tx, null, { restaurantId: r.id, action: "join.requested", entity: "join_request", entityId: row!.id, data: { name: d.name } });
    await notify(tx, { k: "join", r: r.id });
    return { id: row!.id, secret };
  });
}

/** What the person's phone sees: waiting, accepted (with the matricule) or declined. */
export async function joinRequestStatus(db: DB, id: string, secret: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const row = await db.query.joinRequests.findFirst({ where: eq(joinRequests.id, id) });
  if (!row || !safeEqual(row.secretHash, sha256(secret))) return null;
  let staffNo: number | null = null;
  if (row.status === "accepted" && row.memberId) {
    const m = await db.query.members.findFirst({ where: eq(members.id, row.memberId) });
    staffNo = m?.staffNo ?? null;
  }
  const r = await db.query.restaurants.findFirst({ where: eq(restaurants.id, row.restaurantId) });
  return { status: row.status, name: row.name, staffNo, restaurantName: r?.name ?? "", restaurantSlug: r?.slug ?? "" };
}

/* ---------------------------------------------------------------- the owner's side */

export async function pendingJoinRequests(db: DB, restaurantId: string) {
  return db
    .select({ id: joinRequests.id, name: joinRequests.name, phone: joinRequests.phone, createdAt: joinRequests.createdAt })
    .from(joinRequests)
    .where(and(eq(joinRequests.restaurantId, restaurantId), eq(joinRequests.status, "pending")))
    .orderBy(desc(joinRequests.createdAt));
}

export async function pendingJoinCount(db: DB, restaurantId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(joinRequests).where(and(eq(joinRequests.restaurantId, restaurantId), eq(joinRequests.status, "pending")));
  return Number(row?.n ?? 0);
}

async function actingMemberId(ctx: PersonnelCtx): Promise<string | null> {
  if (ctx.actor.kind !== "member") return null;
  const actor = ctx.actor;
  const [m] = await ctx.db.select({ id: members.id }).from(members).where(and(eq(members.restaurantId, ctx.repo.restaurantId), eq(members.clerkUserId, actor.userId))).limit(1);
  return m?.id ?? null;
}

/**
 * Accept: the person becomes a member of this business with the chosen role, the next matricule
 * and the PIN they chose. Roles that manage the personnel are the owner's decision.
 */
export async function acceptJoinRequest(ctx: PersonnelCtx, requestId: string, jobRoleId: string) {
  needStaff(ctx);
  const rid = ctx.repo.restaurantId;
  const role = await roleForNewPerson(ctx, jobRoleId);
  const by = await actingMemberId(ctx);
  return ctx.db.transaction(async (tx) => {
    const [req] = await tx
      .select()
      .from(joinRequests)
      .where(and(eq(joinRequests.id, requestId), eq(joinRequests.restaurantId, rid)))
      .for("update");
    if (!req) throw new NotFoundError();
    if (req.status !== "pending") throw new NotFoundError();
    const staffNo = await nextStaffNo(tx, rid);
    const [m] = await tx
      .insert(members)
      .values({ restaurantId: rid, clerkUserId: null, name: req.name, phone: req.phone, role: role.level, jobRoleId: role.id, staffNo, pinHash: req.pinHash })
      .returning();
    await tx
      .update(joinRequests)
      .set({ status: "accepted", memberId: m!.id, jobRoleId: role.id, decidedBy: by, decidedAt: new Date() })
      .where(eq(joinRequests.id, req.id));
    await writeAudit(tx, ctx.actor, { restaurantId: rid, action: "join.accepted", entity: "member", entityId: m!.id, data: { requestId: req.id, staffNo, jobRoleId: role.id } });
    await notify(tx, { k: "join", r: rid });
    return { memberId: m!.id, staffNo };
  });
}

export async function declineJoinRequest(ctx: PersonnelCtx, requestId: string) {
  needStaff(ctx);
  const rid = ctx.repo.restaurantId;
  const by = await actingMemberId(ctx);
  const done = await ctx.db
    .update(joinRequests)
    .set({ status: "declined", decidedBy: by, decidedAt: new Date() })
    .where(and(eq(joinRequests.id, requestId), eq(joinRequests.restaurantId, rid), eq(joinRequests.status, "pending")))
    .returning({ id: joinRequests.id });
  if (!done.length) throw new NotFoundError();
  await writeAudit(ctx.db, ctx.actor, { restaurantId: rid, action: "join.declined", entity: "join_request", entityId: requestId });
}
