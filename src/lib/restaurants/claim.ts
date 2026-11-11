import { and, eq, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { members, restaurants } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { nextStaffNo } from "@/lib/personnel";
import { ensureJobRoles } from "@/lib/personnel/role-catalog";

/**
 * Businesses prepared for someone (`settings.ownerEmail`): when that person signs in with the
 * same, verified email, they become the owner (matricule 001 if free). Returns the ids claimed.
 * The email must come from the identity provider as verified, never from a form.
 */
export async function claimBusinessesByEmail(db: DB, user: { clerkUserId: string; verifiedEmail: string; name?: string | null }): Promise<string[]> {
  const email = user.verifiedEmail.trim().toLowerCase();
  if (!email.includes("@")) return [];
  const waiting = await db.select({ id: restaurants.id }).from(restaurants).where(sql`lower(${restaurants.settings}->>'ownerEmail') = ${email}`);
  const claimed: string[] = [];
  for (const { id } of waiting) {
    const done = await db.transaction(async (tx) => {
      // Lock the row: two tabs signing in at once must not create two owners.
      const [r] = await tx.select().from(restaurants).where(eq(restaurants.id, id)).for("update");
      if (!r || (r.settings.ownerEmail ?? "").toLowerCase() !== email) return false;
      const [owner] = await tx.select({ id: members.id }).from(members).where(and(eq(members.restaurantId, id), eq(members.role, "owner"))).limit(1);
      if (!owner) {
        const staffNo = await nextStaffNo(tx, id);
        await tx.insert(members).values({ restaurantId: id, clerkUserId: user.clerkUserId, role: "owner", staffNo, email, name: user.name ?? null });
      }
      await tx
        .update(restaurants)
        .set({ settings: sql`${restaurants.settings} - 'ownerEmail'` })
        .where(eq(restaurants.id, id));
      await writeAudit(tx, { kind: "member", userId: user.clerkUserId, restaurantId: id, role: "owner" }, { restaurantId: id, action: "restaurant.claimed", entity: "restaurant", entityId: id, data: { email } });
      return !owner;
    });
    if (done) {
      await ensureJobRoles(db, id);
      claimed.push(id);
    }
  }
  return claimed;
}
