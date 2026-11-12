import { ensureMainCode } from "@/lib/access-codes";
import { ensureJobRoles } from "@/lib/personnel/role-catalog";
import { z } from "zod";
import type { DB } from "@/db";
import { members, planEvents, restaurants } from "@/db/schema";
import { TRIAL_DAYS, TRIAL_PLAN } from "@/config/plans";
import { writeAudit } from "@/lib/audit";
import { isUniqueViolation } from "@/lib/errors";
import type { Actor } from "@/lib/auth/can";
import { slugify } from "@/lib/slug";
import { checkBusinessName } from "./name-check";

/** Maximum restaurants one person can create themselves (branches come with the Business plan, M7). */
export const MAX_OWNED_RESTAURANTS = 3;

export const CreateRestaurantInput = z.object({
  name: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(60).default("Ouagadougou"),
  /** « transport »: a VIP bus company serving food on board (buses, itineraries, hostesses). */
  kind: z.enum(["restaurant", "transport"]).default("restaurant"),
});
export type CreateRestaurantInput = z.infer<typeof CreateRestaurantInput>;

/** A business name already used (same web address or same name): the owner picks another one. */
export class NameTakenError extends Error {
  constructor(public suggestions: Array<{ name: string; slug: string }>) {
    super("name_taken");
  }
}

/**
 * A signed-in user creates a restaurant and becomes its owner.
 * Starts a 30-day Pro trial; the menu stays unpublished until the owner publishes it.
 */
export async function createRestaurantForUser(
  db: DB,
  user: { clerkUserId: string; email?: string | null; name?: string | null },
  input: z.input<typeof CreateRestaurantInput>,
) {
  const data = CreateRestaurantInput.parse(input);
  // Each business has its own name and web address: a name already used is refused, with
  // suggestions close to it (the form checks it live before this).
  const check = await checkBusinessName(db, data.name, { city: data.city, kind: data.kind });
  if (!check.available) throw new NameTakenError(check.suggestions);
  try {
    const restaurant = await insertRestaurant(db, user, data);
    // The main QR (menu link) exists from the start; give it its typed code right away.
    await ensureMainCode(db, restaurant.id);
    // Ready-made job roles (server, cook, cleaner…) that the owner can edit.
    await ensureJobRoles(db, restaurant.id);
    return restaurant;
  } catch (err) {
    // Two people creating the same name at the same second: the unique address decides.
    if (isUniqueViolation(err)) throw new NameTakenError((await checkBusinessName(db, data.name, { city: data.city, kind: data.kind })).suggestions);
    throw err;
  }
}

async function insertRestaurant(db: DB, user: { clerkUserId: string; email?: string | null; name?: string | null }, data: CreateRestaurantInput) {
  return db.transaction(async (tx) => {
    const slug = slugify(data.name);
    const expires = new Date(Date.now() + TRIAL_DAYS * 86_400_000);
    const [restaurant] = await tx
      .insert(restaurants)
      .values({
        name: data.name,
        city: data.city,
        kind: data.kind,
        slug,
        plan: TRIAL_PLAN,
        planStatus: "trial",
        planExpiresAt: expires,
        // On a bus: one QR per seat back, and the hostess confirms each order she scans.
        ...(data.kind === "transport" ? { settings: { qrStrategy: "per_seat" as const, orderValidation: "server_confirms" as const, seatingModes: [] } } : {}),
      })
      .returning();
    if (!restaurant) throw new Error("restaurant insert failed");
    const [owner] = await tx
      .insert(members)
      .values({
        restaurantId: restaurant.id,
        clerkUserId: user.clerkUserId,
        role: "owner",
        // The founder is personnel n° 001.
        staffNo: 1,
        email: user.email ?? null,
        name: user.name ?? null,
      })
      .returning();
    await tx.insert(planEvents).values({
      restaurantId: restaurant.id,
      toPlan: TRIAL_PLAN,
      toStatus: "trial",
      automatic: true,
      reference: `trial:${TRIAL_DAYS}d`,
    });
    const actor: Actor = { kind: "member", userId: user.clerkUserId, restaurantId: restaurant.id, role: "owner" };
    await writeAudit(tx, actor, {
      restaurantId: restaurant.id,
      action: "restaurant.created",
      entity: "restaurant",
      entityId: restaurant.id,
      data: { slug, ownerMemberId: owner?.id },
    });
    return restaurant;
  });
}
