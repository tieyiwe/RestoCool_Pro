import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { closeDb, getDb } from "@/db";
import { menuItemVariants, menuItems, promotions, restaurants } from "@/db/schema";
import { priceLines } from "@/lib/orders/service";
import { promoPrices } from "@/lib/promotions";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("dish offers set the order price on the server (database)", () => {
  afterAll(async () => {
    await getDb().delete(promotions).where(eq(promotions.createdBy, "promo-test"));
    await closeDb();
  });

  it("a running offer replaces the price; a paused or ended one does not", async () => {
    const db = getDb();
    const [r] = await db.select().from(restaurants).where(eq(restaurants.slug, "restaurant-demo"));
    const all = await db.select().from(menuItems).where(and(eq(menuItems.restaurantId, r!.id)));
    const variants = await db.select({ itemId: menuItemVariants.itemId }).from(menuItemVariants).where(eq(menuItemVariants.restaurantId, r!.id));
    const item = all.find((i) => i.price !== null && i.available && !variants.some((v) => v.itemId === i.id))!;
    const [p] = await db
      .insert(promotions)
      .values({ scope: "business", restaurantId: r!.id, placement: "item", itemId: item.id, title: { fr: "Promo" }, promoPrice: 100, createdBy: "promo-test" })
      .returning();
    const promos = await promoPrices(db, r!.id, [item.id]);
    expect(promos.get(item.id)).toBe(100);
    const priced = await priceLines(db, r!.id, [{ itemId: item.id, variantId: null, optionIds: [], qty: 2 }], new Date(), promos);
    expect(priced.subtotal).toBe(200);

    await db.update(promotions).set({ active: false }).where(eq(promotions.id, p!.id));
    expect((await promoPrices(db, r!.id, [item.id])).has(item.id)).toBe(false);
    await db.update(promotions).set({ active: true, endsAt: new Date(Date.now() - 1000) }).where(eq(promotions.id, p!.id));
    expect((await promoPrices(db, r!.id, [item.id])).has(item.id)).toBe(false);
    const normal = await priceLines(db, r!.id, [{ itemId: item.id, variantId: null, optionIds: [], qty: 2 }]);
    expect(normal.subtotal).toBe(item.price! * 2);
  });
});
