import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { closeDb, getDb } = await import("@/db");
const { tenantRepo } = await import("@/db/repos/tenant");
const { menuCategories, menuItems, orders, restaurants, seats } = await import("@/db/schema");
const { placeWhatsappOrder, whatsappOrders } = await import("@/lib/orders/whatsapp");
const { expireUnhandledOrders } = await import("@/lib/seating/sessions");
const { saveService } = await import("@/lib/restaurants/settings");
const { createRestaurantForUser } = await import("@/lib/restaurants/provision");

const hasDb = Boolean(process.env.DATABASE_URL);
const PHONE = "waOrderPhoneAAAAAAAAAA";

describe.skipIf(!hasDb)("WhatsApp takeaway orders and service types (database)", () => {
  type R = typeof restaurants.$inferSelect;
  const ids: string[] = [];
  let r: R;
  let other: R;
  let rizId: string;

  beforeAll(async () => {
    const db = getDb();
    r = await createRestaurantForUser(db, { clerkUserId: "it-wa-a" }, { name: "Maquis WhatsApp", city: "Ouagadougou" });
    other = await createRestaurantForUser(db, { clerkUserId: "it-wa-b" }, { name: "Maquis WhatsApp Voisin", city: "Ouagadougou" });
    ids.push(r.id, other.id);
    await db.update(restaurants).set({ whatsapp: "22670000000", plan: "gratuit", planStatus: "active" }).where(eq(restaurants.id, r.id));
    r = (await db.query.restaurants.findFirst({ where: eq(restaurants.id, r.id) }))!;
    const [cat] = await db.insert(menuCategories).values({ restaurantId: r.id, name: { fr: "Plats" } }).returning();
    const [riz] = await db.insert(menuItems).values({ restaurantId: r.id, categoryId: cat!.id, name: { fr: "Riz gras" }, price: 2500 }).returning();
    rizId = riz!.id;
  });
  afterAll(async () => {
    await getDb().delete(restaurants).where(inArray(restaurants.id, ids));
    await closeDb();
  });

  it("records the order (free plan too), prices it on the server, never twice, and lists it for the business only", async () => {
    const db = getDb();
    const input = { customerName: "Awa", pickupTime: "12:30", requestId: "wa-order-test-000001", lines: [{ itemId: rizId, variantId: null, optionIds: [], qty: 2 }] };
    const o = await placeWhatsappOrder(db, r, PHONE, input);
    expect(o).toMatchObject({ channel: "whatsapp", status: "sent", subtotal: 5000, customerName: "Awa", pickupTime: "12:30", seatType: "takeaway" });
    expect((await placeWhatsappOrder(db, r, PHONE, input)).id).toBe(o.id);
    const list = await whatsappOrders(db, r.id);
    expect(list.open.map((x) => x.id)).toEqual([o.id]);
    expect(list.open[0]!.items[0]).toMatchObject({ qty: 2, name: "Riz gras" });
    expect((await whatsappOrders(db, other.id)).open).toEqual([]);
    // Not closed as « non prise en charge » after 2 h: it waits for « Remise au client ».
    await expireUnhandledOrders(db, r.id, new Date(Date.now() + 3 * 3600_000));
    const [still] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, o.id));
    expect(still?.status).toBe("sent");
  });

  it("takeaway and delivery only: no tables are created; nothing chosen is refused", async () => {
    const db = getDb();
    const ctx = { db, actor: { kind: "member" as const, userId: "it-wa-a", restaurantId: r.id, role: "owner" as const }, repo: tenantRepo(db, r.id) };
    await expect(saveService(ctx, { seatingModes: [], qrStrategy: "generic", orderValidation: "server_confirms", enabledLocales: ["fr"] })).rejects.toMatchObject({ code: "no_service" });
    await saveService(ctx, { seatingModes: ["takeaway", "delivery"], qrStrategy: "generic", orderValidation: "server_confirms", enabledLocales: ["fr"], tableCount: 10 });
    const list = await db.select({ type: seats.type }).from(seats).where(eq(seats.restaurantId, r.id));
    expect(list.some((s) => s.type === "table")).toBe(false);
  });
});
