import { and, eq, like } from "drizzle-orm";
import type { DB } from "@/db";
import { members, planEvents, restaurants } from "@/db/schema";
import { TRIAL_DAYS, TRIAL_PLAN } from "@/config/plans";
import { writeAudit } from "@/lib/audit";
import { RESERVED_SLUGS, slugify } from "@/lib/slug";
import type { MemberRole } from "@/lib/auth/can";

/** Clerk org role → RestoCool role. Admins of the Clerk org are owners; everyone else starts as manager. */
export function roleFromClerk(orgRole: string | null | undefined): MemberRole {
  return orgRole === "org:admin" ? "owner" : "manager";
}

async function uniqueSlug(db: DB, name: string): Promise<string> {
  const base = slugify(name);
  const taken = new Set(
    (await db.select({ slug: restaurants.slug }).from(restaurants).where(like(restaurants.slug, `${base}%`))).map((r) => r.slug),
  );
  if (!taken.has(base) && !RESERVED_SLUGS.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Idempotent: one Clerk Organization = one restaurant.
 * Called by the Clerk webhook and, as a fallback, on first sign-in (webhook lag).
 */
export async function ensureRestaurantForOrg(db: DB, org: { id: string; name: string }) {
  const existing = await db.query.restaurants.findFirst({ where: eq(restaurants.clerkOrgId, org.id) });
  if (existing) return existing;

  return db.transaction(async (tx) => {
    const slug = await uniqueSlug(tx as unknown as DB, org.name);
    const expires = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
    const [created] = await tx
      .insert(restaurants)
      .values({ clerkOrgId: org.id, name: org.name, slug, plan: TRIAL_PLAN, planStatus: "trial", planExpiresAt: expires })
      .onConflictDoNothing({ target: restaurants.clerkOrgId })
      .returning();
    if (!created) {
      // Lost a race with a concurrent request: return the winner.
      const again = await tx.query.restaurants.findFirst({ where: eq(restaurants.clerkOrgId, org.id) });
      if (!again) throw new Error("restaurant provisioning race");
      return again;
    }
    await tx.insert(planEvents).values({
      restaurantId: created.id,
      toPlan: TRIAL_PLAN,
      toStatus: "trial",
      automatic: true,
      reference: `trial:${TRIAL_DAYS}d`,
    });
    await writeAudit(tx, null, {
      restaurantId: created.id,
      action: "restaurant.created",
      entity: "restaurant",
      entityId: created.id,
      data: { clerkOrgId: org.id, slug },
    });
    return created;
  });
}

/**
 * Create the member row if missing. An existing row keeps its role and active flag,
 * unless `reactivate` is set (Clerk webhook: the user was explicitly re-added to the org).
 */
export async function ensureMember(
  db: DB,
  restaurantId: string,
  m: { clerkUserId: string; role: MemberRole; email?: string | null; name?: string | null },
  opts: { reactivate?: boolean } = {},
) {
  const values = { restaurantId, clerkUserId: m.clerkUserId, role: m.role, email: m.email ?? null, name: m.name ?? null };
  const target = [members.restaurantId, members.clerkUserId];
  if (opts.reactivate) {
    await db.insert(members).values(values).onConflictDoUpdate({ target, set: { active: true } });
  } else {
    await db.insert(members).values(values).onConflictDoNothing({ target });
  }
  const row = await db.query.members.findFirst({
    where: and(eq(members.restaurantId, restaurantId), eq(members.clerkUserId, m.clerkUserId)),
  });
  if (!row) throw new Error("member provisioning failed");
  return row;
}

export async function deactivateMember(db: DB, restaurantId: string, clerkUserId: string) {
  await db
    .update(members)
    .set({ active: false })
    .where(and(eq(members.restaurantId, restaurantId), eq(members.clerkUserId, clerkUserId)));
}
