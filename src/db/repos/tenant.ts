import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db";
import {
  areas,
  auditLog,
  fortunes,
  jobRoles,
  members,
  menuCategories,
  menuItemOptions,
  menuItemVariants,
  menuItems,
  openingHours,
  restaurants,
  seats,
} from "@/db/schema";

/**
 * The ONLY way application code reads tenant data.
 * Every query is pinned to `restaurantId`, which must come from the authenticated
 * context (Clerk org, staff session or seat QR token), never from request input.
 */
export function tenantRepo(db: DB, restaurantId: string) {
  if (!restaurantId) throw new Error("tenantRepo requires a restaurantId");

  return {
    restaurantId,

    restaurant: {
      get: () => db.query.restaurants.findFirst({ where: eq(restaurants.id, restaurantId) }),
      openingHours: () =>
        db.select().from(openingHours).where(eq(openingHours.restaurantId, restaurantId)).orderBy(asc(openingHours.weekday)),
    },

    members: {
      list: () => db.select().from(members).where(eq(members.restaurantId, restaurantId)).orderBy(asc(members.createdAt)),
      byClerkUser: (clerkUserId: string) =>
        db.query.members.findFirst({
          where: and(eq(members.restaurantId, restaurantId), eq(members.clerkUserId, clerkUserId), eq(members.active, true)),
        }),
    },

    seating: {
      areas: () => db.select().from(areas).where(eq(areas.restaurantId, restaurantId)).orderBy(asc(areas.sort)),
      seats: () =>
        db.select().from(seats).where(eq(seats.restaurantId, restaurantId)).orderBy(asc(seats.type), asc(seats.sort)),
    },

    menu: {
      categories: () =>
        db
          .select()
          .from(menuCategories)
          .where(eq(menuCategories.restaurantId, restaurantId))
          .orderBy(asc(menuCategories.sort)),
      items: () =>
        db.select().from(menuItems).where(eq(menuItems.restaurantId, restaurantId)).orderBy(asc(menuItems.sort)),
      item: (itemId: string) =>
        db.query.menuItems.findFirst({ where: and(eq(menuItems.restaurantId, restaurantId), eq(menuItems.id, itemId)) }),
      variants: () =>
        db
          .select()
          .from(menuItemVariants)
          .where(eq(menuItemVariants.restaurantId, restaurantId))
          .orderBy(asc(menuItemVariants.sort)),
      options: () =>
        db
          .select()
          .from(menuItemOptions)
          .where(eq(menuItemOptions.restaurantId, restaurantId))
          .orderBy(asc(menuItemOptions.sort)),
      countItems: async () => {
        const [row] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(menuItems)
          .where(eq(menuItems.restaurantId, restaurantId));
        return row?.n ?? 0;
      },
      fortunes: () => db.select().from(fortunes).where(and(eq(fortunes.restaurantId, restaurantId), eq(fortunes.active, true))),
    },

    audit: {
      recent: (limit = 50) =>
        db
          .select()
          .from(auditLog)
          .where(eq(auditLog.restaurantId, restaurantId))
          .orderBy(desc(auditLog.createdAt))
          .limit(Math.min(limit, 200)),
    },
  };
}

export type TenantRepo = ReturnType<typeof tenantRepo>;

/** Public lookup by slug (menu page). Only returns published restaurants unless `includeUnpublished`. */
export async function findRestaurantBySlug(db: DB, slug: string, opts: { includeUnpublished?: boolean } = {}) {
  const r = await db.query.restaurants.findFirst({ where: eq(restaurants.slug, slug.toLowerCase()) });
  if (!r) return null;
  if (r.deletedAt) return null;
  if (!r.published && !opts.includeUnpublished) return null;
  return r;
}

/**
 * Restaurants a signed-in user belongs to (active memberships only).
 * Platform-level lookup keyed by the authenticated Clerk user id: it is how we
 * discover the tenant, before any tenantRepo exists.
 */
export async function membershipsForUser(db: DB, clerkUserId: string) {
  return db
    .select({
      memberId: members.id,
      role: members.role,
      access: jobRoles.access,
      restaurantId: restaurants.id,
      restaurantName: restaurants.name,
      restaurantSlug: restaurants.slug,
    })
    .from(members)
    .innerJoin(restaurants, eq(restaurants.id, members.restaurantId))
    .leftJoin(jobRoles, and(eq(jobRoles.id, members.jobRoleId), eq(jobRoles.restaurantId, members.restaurantId)))
    // A deleted business (owner's request, confirmed) closes for its whole team.
    .where(and(eq(members.clerkUserId, clerkUserId), eq(members.active, true), isNull(restaurants.deletedAt)))
    .orderBy(asc(members.createdAt));
}

export type Membership = Awaited<ReturnType<typeof membershipsForUser>>[number];
