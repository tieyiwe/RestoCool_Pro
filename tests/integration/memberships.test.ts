import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db";
import { membershipsForUser, tenantRepo } from "@/db/repos/tenant";
import { auditLog, members, planEvents, restaurants } from "@/db/schema";
import { isUniqueViolation } from "@/lib/errors";
import { createRestaurantForUser } from "@/lib/restaurants/provision";

const hasDb = Boolean(process.env.DATABASE_URL);
const USER = "user_test_memberships";
const OTHER = "user_test_other";

describe.skipIf(!hasDb)("app-managed tenants (database)", () => {
  const created: string[] = [];

  afterAll(async () => {
    if (created.length) await getDb().delete(restaurants).where(inArray(restaurants.id, created));
    await closeDb();
  });

  it("creating a restaurant makes the user its owner, starts a Pro trial and logs it", async () => {
    const db = getDb();
    const r = await createRestaurantForUser(db, { clerkUserId: USER, email: "owner@example.com" }, { name: "Maquis Le Baobab", city: "Bobo-Dioulasso" });
    created.push(r.id);
    expect(r.slug).toMatch(/^maquis-le-baobab/);
    expect(r.plan).toBe("pro");
    expect(r.planStatus).toBe("trial");
    expect(r.published).toBe(false);

    const [m] = await db.select().from(members).where(eq(members.restaurantId, r.id));
    expect(m).toMatchObject({ clerkUserId: USER, role: "owner", active: true });
    expect(await db.select().from(planEvents).where(eq(planEvents.restaurantId, r.id))).toHaveLength(1);
    const logs = await db.select().from(auditLog).where(eq(auditLog.restaurantId, r.id));
    expect(logs.map((l) => l.action)).toContain("restaurant.created");
  });

  it("gives a unique slug to a second restaurant with the same name", async () => {
    const r2 = await createRestaurantForUser(getDb(), { clerkUserId: USER }, { name: "Maquis Le Baobab", city: "Ouagadougou" });
    created.push(r2.id);
    const [first] = await getDb().select().from(restaurants).where(eq(restaurants.id, created[0]!));
    expect(r2.slug).not.toBe(first!.slug);
  });

  it("two restaurants created at the same time with the same name both get a slug", async () => {
    const name = `Maquis Simultané ${Date.now()}`;
    const rs = await Promise.all(
      Array.from({ length: 3 }, (_, i) => createRestaurantForUser(getDb(), { clerkUserId: `${USER}-race-${i}` }, { name, city: "Ouagadougou" })),
    );
    created.push(...rs.map((r) => r.id));
    expect(new Set(rs.map((r) => r.slug)).size).toBe(3);
  });

  it("isUniqueViolation recognises the slug unique index error", async () => {
    const [first] = await getDb().select().from(restaurants).where(eq(restaurants.id, created[0]!));
    const err = await getDb()
      .insert(restaurants)
      .values({ name: "Doublon", city: "Ouagadougou", slug: first!.slug })
      .then(() => null, (e: unknown) => e);
    expect(isUniqueViolation(err)).toBe(true);
    expect(isUniqueViolation(new Error("other"))).toBe(false);
  });

  it("lists only the user's own active memberships", async () => {
    const other = await createRestaurantForUser(getDb(), { clerkUserId: OTHER }, { name: "Chez Autre", city: "Koudougou" });
    created.push(other.id);
    const mine = await membershipsForUser(getDb(), USER);
    expect(mine.map((m) => m.restaurantId).sort()).toEqual(created.slice(0, 2).sort());
    expect(mine.some((m) => m.restaurantId === other.id)).toBe(false);

    // A deactivated membership disappears.
    await getDb().update(members).set({ active: false }).where(eq(members.restaurantId, created[1]!));
    expect((await membershipsForUser(getDb(), USER)).map((m) => m.restaurantId)).toEqual([created[0]]);
  });

  it("a new restaurant starts with an empty menu, isolated from others", async () => {
    expect(await tenantRepo(getDb(), created[0]!).menu.items()).toHaveLength(0);
  });

  it("rejects an invalid name", async () => {
    await expect(createRestaurantForUser(getDb(), { clerkUserId: USER }, { name: " ", city: "Ouagadougou" })).rejects.toThrow();
  });
});
