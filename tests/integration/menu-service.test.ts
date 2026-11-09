import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { closeDb, getDb } = await import("@/db");
const { tenantRepo } = await import("@/db/repos/tenant");
const { auditLog, menuItems, restaurants } = await import("@/db/schema");
const menu = await import("@/lib/menu/service");
const settings = await import("@/lib/restaurants/settings");
const { createRestaurantForUser } = await import("@/lib/restaurants/provision");
const { PlanLimitError, NotFoundError } = await import("@/lib/errors");

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("menu + settings services (database)", () => {
  const ids: string[] = [];
  type Ctx = Parameters<typeof menu.createItem>[0];
  let A: Ctx;
  let B: Ctx;

  const ctxFor = (restaurantId: string, userId: string): Ctx => ({
    db: getDb(),
    actor: { kind: "member", userId, restaurantId, role: "owner" },
    repo: tenantRepo(getDb(), restaurantId),
  });

  const baseItem = (categoryId: string) => ({
    categoryId,
    code: "1",
    name: { fr: "Riz gras", en: "", zh: "" },
    description: { fr: "", en: "", zh: "" },
    price: 1500,
    variants: [],
    options: [],
    spicy: 0,
    tags: [],
    station: "kitchen" as const,
    photoUrl: null,
    thumbUrl: null,
    available: true,
  });

  beforeAll(async () => {
    const a = await createRestaurantForUser(getDb(), { clerkUserId: "it-menu-a" }, { name: "Maquis Test A", city: "Ouagadougou" });
    const b = await createRestaurantForUser(getDb(), { clerkUserId: "it-menu-b" }, { name: "Maquis Test B", city: "Bobo-Dioulasso" });
    ids.push(a.id, b.id);
    A = ctxFor(a.id, "it-menu-a");
    B = ctxFor(b.id, "it-menu-b");
  });

  afterAll(async () => {
    await getDb().delete(restaurants).where(inArray(restaurants.id, ids));
    await closeDb();
  });

  it("creates categories and items with variants, and logs who did it", async () => {
    const cat = await menu.createCategory(A, { name: { fr: "Grillades", en: "Grills", zh: "" }, active: true, timeWindow: null });
    const item = await menu.createItem(A, {
      ...baseItem(cat.id),
      name: { fr: "Poulet bicyclette", en: "", zh: "" },
      price: null,
      variants: [
        { name: { fr: "Demi", en: "", zh: "" }, price: 3500 },
        { name: { fr: "Entier", en: "", zh: "" }, price: 6500 },
      ],
    });
    const variants = (await A.repo.menu.variants()).filter((v) => v.itemId === item.id);
    expect(variants.map((v) => v.price)).toEqual([3500, 6500]);
    const logs = await getDb().select().from(auditLog).where(eq(auditLog.entityId, item.id));
    expect(logs[0]).toMatchObject({ action: "menu.item.created", actorType: "member", actorId: "it-menu-a" });
  });

  it("refuses to put a dish in another restaurant's category", async () => {
    const catB = await menu.createCategory(B, { name: { fr: "Boissons", en: "", zh: "" }, active: true, timeWindow: null });
    await expect(menu.createItem(A, baseItem(catB.id))).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses to edit, delete or mark sold out another restaurant's dish", async () => {
    const catB = (await B.repo.menu.categories())[0]!;
    const itemB = await menu.createItem(B, baseItem(catB.id));
    await expect(menu.updateItem(A, itemB.id, baseItem(catB.id))).rejects.toBeInstanceOf(NotFoundError);
    await expect(menu.deleteItem(A, itemB.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(menu.setSoldOutToday(A, itemB.id, true)).rejects.toBeInstanceOf(NotFoundError);
    const still = await getDb().query.menuItems.findFirst({ where: eq(menuItems.id, itemB.id) });
    expect(still?.soldOutUntil).toBeNull();
  });

  it("refuses a photo uploaded by another restaurant", async () => {
    const cat = (await A.repo.menu.categories())[0]!;
    const foreign = `/api/media/r/${B.repo.restaurantId}/abcdefghijklmnopqrstuv.webp`;
    await expect(menu.createItem(A, { ...baseItem(cat.id), photoUrl: foreign, thumbUrl: foreign })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("épuisé aujourd'hui sets the item until midnight, and back in stock clears it", async () => {
    const item = (await A.repo.menu.items())[0]!;
    await menu.setSoldOutToday(A, item.id, true);
    expect((await A.repo.menu.item(item.id))!.soldOutUntil!.getTime()).toBeGreaterThan(Date.now());
    await menu.setSoldOutToday(A, item.id, false);
    expect((await A.repo.menu.item(item.id))!.soldOutUntil).toBeNull();
  });

  it("a non-empty category cannot be deleted", async () => {
    const cat = (await A.repo.menu.categories())[0]!;
    expect(await menu.deleteCategory(A, cat.id)).toBe("not_empty");
  });

  it("the Gratuit plan stops at 40 dishes", async () => {
    await getDb().update(restaurants).set({ plan: "gratuit", planStatus: "active" }).where(eq(restaurants.id, B.repo.restaurantId));
    const cat = (await B.repo.menu.categories())[0]!;
    const have = await B.repo.menu.countItems();
    for (let i = have; i < 40; i++) await menu.createItem(B, { ...baseItem(cat.id), code: String(i) });
    await expect(menu.createItem(B, baseItem(cat.id))).rejects.toBeInstanceOf(PlanLimitError);
  });

  it("settings: slug must be unique, colours readable, badge hidden only on Business", async () => {
    const other = (await B.repo.restaurant.get())!;
    const profile = { name: "Maquis Test A", slug: other.slug, description: { fr: "", en: "", zh: "" }, city: "Ouagadougou", address: "", gmapsUrl: "" };
    await expect(settings.saveProfile(A, profile)).rejects.toMatchObject({ code: "slug_taken" });
    await expect(settings.saveProfile(A, { ...profile, slug: "admin" })).rejects.toMatchObject({ code: "slug_reserved" });
    await expect(settings.saveAppearance(A, { theme: "light", accentColor: "#E9B530", logoUrl: "", coverUrl: "" })).rejects.toMatchObject({ code: "contrast" });
    await expect(settings.saveFeatures(A, { features: {}, poweredBadge: false })).rejects.toMatchObject({ code: "badge_plan" });
    await expect(settings.saveContacts(A, { phones: ["12"], whatsapp: "", orangeMoney: "", moovMoney: "" })).rejects.toMatchObject({ code: "phone_invalid" });
    await settings.saveContacts(A, { phones: ["70 12 34 56"], whatsapp: "+226 70 12 34 56", orangeMoney: "", moovMoney: "" });
    expect((await A.repo.restaurant.get())!.phones).toEqual(["22670123456"]);
  });

  it("publishing needs at least one visible dish", async () => {
    const empty = await createRestaurantForUser(getDb(), { clerkUserId: "it-menu-c" }, { name: "Maquis Vide", city: "Koudougou" });
    ids.push(empty.id);
    await expect(settings.setPublished(ctxFor(empty.id, "it-menu-c"), true)).rejects.toMatchObject({ code: "publish_empty" });
    await settings.setPublished(A, true);
    expect((await A.repo.restaurant.get())!.published).toBe(true);
  });
});
