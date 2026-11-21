import "server-only";
import { timingSafeEqual } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { members, restaurants } from "@/db/schema";
import type { AdminCtx } from "@/lib/admin/manage";
import { writeAudit } from "@/lib/audit";
import { NotFoundError } from "@/lib/errors";
import { randomToken } from "@/lib/tokens";

/**
 * Owner invitations for businesses prepared by RestoCool (menu, photos, logo… already done):
 * from the console, TIBLOGICS types the owner's email; RestoCool emails a link that carries the
 * business address, `/r/<slug>/proprietaire/<token>`. The person creates an account (or signs in)
 * with that email, the sign-in provider verifies it, and they become the owner (matricule 001),
 * then finish the setup wizard where RestoCool left it.
 *
 * The token only opens the invitation page; taking the business also needs the invited email,
 * verified by the sign-in provider (`claimBusinessesByEmail`). So the token is kept in the
 * business settings (the console can copy the link at any time and share it by WhatsApp).
 */

export const INVITE_DAYS = 30;
// Simple shape check: taking the business still needs this address verified by the sign-in provider.
const EmailInput = z.string().max(200).regex(/^[^@\s]+@[^@\s]+$/);

export class OwnerExistsError extends Error {
  code = "owner_exists" as const;
}

export const inviteUrl = (base: string, slug: string, token: string) => `${base}/r/${slug}/proprietaire/${token}`;

async function hasOwner(db: Pick<DB, "select">, restaurantId: string) {
  const [o] = await db.select({ id: members.id }).from(members).where(and(eq(members.restaurantId, restaurantId), eq(members.role, "owner"), eq(members.active, true))).limit(1);
  return !!o;
}

/**
 * Creates (or renews) the invitation: records the owner email (so the claim works), a fresh link
 * valid INVITE_DAYS days, and who sent it. Refused once the business has an owner.
 */
export async function inviteOwner(c: AdminCtx, restaurantId: string, input: { email: string; lang: "fr" | "en" }) {
  const email = EmailInput.parse(input.email.trim().toLowerCase());
  return c.db.transaction(async (tx) => {
    const [r] = await tx.select().from(restaurants).where(and(eq(restaurants.id, restaurantId), isNull(restaurants.deletedAt))).for("update");
    if (!r) throw new NotFoundError();
    if (await hasOwner(tx, r.id)) throw new OwnerExistsError();
    const prev = r.settings.ownerInvite;
    const now = new Date();
    const invite = {
      token: randomToken(24),
      email,
      lang: input.lang,
      sentAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + INVITE_DAYS * 86_400_000).toISOString(),
      count: (prev?.email === email ? prev.count : 0) + 1,
      by: c.actor.email,
    };
    const { ownerTransfer: _drop, ...rest } = r.settings;
    await tx.update(restaurants).set({ settings: { ...rest, ownerEmail: email, ownerInvite: invite } }).where(eq(restaurants.id, r.id));
    await writeAudit(tx, c.actor, { restaurantId: r.id, action: "admin.owner_invited", entity: "restaurant", entityId: r.id, data: { email, resend: invite.count > 1 } });
    return { restaurant: r, invite };
  });
}

/** Withdraws the invitation (the link stops working, the email can no longer claim). */
export async function cancelOwnerInvite(c: AdminCtx, restaurantId: string) {
  const [r] = await c.db.select().from(restaurants).where(eq(restaurants.id, restaurantId));
  if (!r) throw new NotFoundError();
  await c.db
    .update(restaurants)
    .set({ settings: sql`${restaurants.settings} - 'ownerInvite' - 'ownerEmail'` })
    .where(eq(restaurants.id, r.id));
  await writeAudit(c.db, c.actor, { restaurantId: r.id, action: "admin.owner_invite_cancelled", entity: "restaurant", entityId: r.id, data: { email: r.settings.ownerInvite?.email ?? r.settings.ownerEmail ?? null } });
}

const sameToken = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export type InviteLookup =
  | { state: "invalid" }
  | { state: "expired" | "owned"; restaurant: typeof restaurants.$inferSelect }
  | { state: "open"; restaurant: typeof restaurants.$inferSelect; email: string; expiresAt: Date };

/** The invitation behind a link: open, expired, already taken (business has an owner) or invalid. */
export async function findOwnerInvite(db: DB, slug: string, token: string, now = new Date()): Promise<InviteLookup> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return { state: "invalid" };
  const [r] = await db.select().from(restaurants).where(and(eq(restaurants.slug, slug), isNull(restaurants.deletedAt))).limit(1);
  if (!r) return { state: "invalid" };
  const inv = r.settings.ownerInvite;
  if (!inv) return r.settings.ownerInviteUsed && sameToken(r.settings.ownerInviteUsed, token) ? { state: "owned", restaurant: r } : { state: "invalid" };
  if (!sameToken(inv.token, token)) return { state: "invalid" };
  if (await hasOwner(db, r.id)) return { state: "owned", restaurant: r };
  if (new Date(inv.expiresAt) < now) return { state: "expired", restaurant: r };
  return { state: "open", restaurant: r, email: inv.email, expiresAt: new Date(inv.expiresAt) };
}

/** « t•••@gmail.com »: enough for the person to recognise the address, not enough to harvest it. */
export function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!user || !domain) return email;
  return `${user.slice(0, Math.min(2, user.length))}${"•".repeat(Math.max(2, Math.min(6, user.length - 2)))}@${domain}`;
}
