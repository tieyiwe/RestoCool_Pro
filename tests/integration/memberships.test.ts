import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db";
import { membershipsForUser, tenantRepo } from "@/db/repos/tenant";
import { auditLog, members, planEvents, restaurants } from "@/db/schema";
import { isUniqueViolation } from "@/lib/errors";
import { NameTakenError, createRestaurantForUser } from "@/lib/restaurants/provision";
import { checkBusinessName } from "@/lib/restaurants/name-check";

vi.mock("server-only", () => ({}));

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

  it("refuses a second business with the same name and suggests 1 to 3 free names close to it", async () => {
    const err = await createRestaurantForUser(getDb(), { clerkUserId: USER }, { name: "Maquis Le Baobab", city: "Ouagadougou" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NameTakenError);
    const suggestions = (err as NameTakenError).suggestions;
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions.length).toBeLessThanOrEqual(3);
    for (const s of suggestions) expect(s.name).toContain("Baobab");
    // Same name in other letters (case, accents) is the same name.
    expect((await checkBusinessName(getDb(), "MAQUIS LE BAOBAB")).available).toBe(false);
    // A suggestion is free: it can be created.
    const r2 = await createRestaurantForUser(getDb(), { clerkUserId: USER }, { name: suggestions[0]!.name, city: "Ouagadougou" });
    created.push(r2.id);
    const [first] = await getDb().select().from(restaurants).where(eq(restaurants.id, created[0]!));
    expect(r2.slug).not.toBe(first!.slug);
  });

  it("two people creating the same name at the same time: one gets it, the others are asked to choose", async () => {
    const name = `Maquis Simultané ${Date.now()}`;
    const rs = await Promise.allSettled(
      Array.from({ length: 3 }, (_, i) => createRestaurantForUser(getDb(), { clerkUserId: `${USER}-race-${i}` }, { name, city: "Ouagadougou" })),
    );
    const ok = rs.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    created.push(...ok.map((r) => (r as PromiseFulfilledResult<{ id: string }>).value.id));
    for (const r of rs) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(NameTakenError);
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
