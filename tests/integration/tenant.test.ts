import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db";
import { tenantRepo } from "@/db/repos/tenant";
import { menuCategories, menuItems, restaurants } from "@/db/schema";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("tenantRepo isolation (database)", () => {
  let aId = "";
  let bId = "";
  let bItemId = "";

  beforeAll(async () => {
    const db = getDb();
    await db.delete(restaurants).where(eq(restaurants.slug, "iso-a"));
    await db.delete(restaurants).where(eq(restaurants.slug, "iso-b"));
    const [a] = await db.insert(restaurants).values({ slug: "iso-a", name: "Iso A" }).returning();
    const [b] = await db.insert(restaurants).values({ slug: "iso-b", name: "Iso B" }).returning();
    aId = a!.id;
    bId = b!.id;
    for (const r of [a!, b!]) {
      const [c] = await db.insert(menuCategories).values({ restaurantId: r.id, name: { fr: `Cat ${r.name}` } }).returning();
      const [i] = await db
        .insert(menuItems)
        .values({ restaurantId: r.id, categoryId: c!.id, name: { fr: `Plat ${r.name}` }, price: 1000 })
        .returning();
      if (r.id === bId) bItemId = i!.id;
    }
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(restaurants).where(eq(restaurants.slug, "iso-a"));
    await db.delete(restaurants).where(eq(restaurants.slug, "iso-b"));
    await closeDb();
  });

  it("lists only the tenant's own rows", async () => {
    const repo = tenantRepo(getDb(), aId);
    const items = await repo.menu.items();
    expect(items.length).toBe(1);
    expect(items.every((i) => i.restaurantId === aId)).toBe(true);
    const cats = await repo.menu.categories();
    expect(cats.every((c) => c.restaurantId === aId)).toBe(true);
  });

  it("cannot fetch another tenant's item by id", async () => {
    const repo = tenantRepo(getDb(), aId);
    expect(await repo.menu.item(bItemId)).toBeUndefined();
    expect(await tenantRepo(getDb(), bId).menu.item(bItemId)).toBeDefined();
  });

  it("refuses to build a repo without a restaurant id", () => {
    expect(() => tenantRepo(getDb(), "")).toThrow();
  });
});
