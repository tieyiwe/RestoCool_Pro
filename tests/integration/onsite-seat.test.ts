import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { closeDb, getDb } = await import("@/db");
const { tenantRepo } = await import("@/db/repos/tenant");
const { menuCategories, menuItems, restaurants, seats } = await import("@/db/schema");
const { createRestaurantForUser } = await import("@/lib/restaurants/provision");
const { syncOnsiteSeat, ONSITE_LABEL } = await import("@/lib/seating/onsite");
const sessions = await import("@/lib/seating/sessions");
const admin = await import("@/lib/seating/admin");
const svc = await import("@/lib/orders/service");

const hasDb = Boolean(process.env.DATABASE_URL);
const PHONE = "onsitePhoneAAAAAAAAAAAA";

describe.skipIf(!hasDb)("dine-in without tables: the automatic « Sur place » place (database)", () => {
  type R = typeof restaurants.$inferSelect;
  let r: R;
  let itemId: string;
  const reload = async () => (r = (await getDb().query.restaurants.findFirst({ where: eq(restaurants.id, r.id) }))!);

  beforeAll(async () => {
    const db = getDb();
    r = await createRestaurantForUser(db, { clerkUserId: "it-onsite" }, { name: "Maquis Sans Tables", city: "Ouagadougou" });
    // Dine-in + takeaway, generic QR, and no table, room, area or counter at all.
    await db.delete(seats).where(eq(seats.restaurantId, r.id));
    await db.update(restaurants).set({ settings: { ...r.settings, seatingModes: ["table", "takeaway"], qrStrategy: "generic" } }).where(eq(restaurants.id, r.id));
    await admin.syncSingletonSeats(db, r.id, ["table", "takeaway"]);
    await reload();
    const [cat] = await db.insert(menuCategories).values({ restaurantId: r.id, name: { fr: "Plats" } }).returning();
    const [it] = await db.insert(menuItems).values({ restaurantId: r.id, categoryId: cat!.id, name: { fr: "Riz gras" }, price: 2500 }).returning();
    itemId = it!.id;
  });
  afterAll(async () => {
    await getDb().delete(restaurants).where(inArray(restaurants.id, [r.id]));
    await closeDb();
  });

  it("offers « Sur place » once, asks the first name, and takes the order", async () => {
    const db = getDb();
    const list = await sessions.pickerSeats(db, r);
    const onsite = list.filter((s) => s.onsite);
    expect(onsite).toHaveLength(1);
    expect(onsite[0]).toMatchObject({ type: "counter", label: ONSITE_LABEL, occupied: false });
    expect(list.some((s) => s.type === "takeaway")).toBe(true);
    // Same place on the next call (no duplicates).
    expect(await syncOnsiteSeat(db, await reload())).toBe(onsite[0]!.id);
    expect((await db.select().from(seats).where(eq(seats.restaurantId, r.id))).filter((s) => s.label === ONSITE_LABEL)).toHaveLength(1);
    expect(sessions.pickable(r, { id: onsite[0]!.id, type: "counter" })).toBe(true);

    const seat = { id: onsite[0]!.id, type: "counter", label: ONSITE_LABEL };
    const noName = await sessions.joinSession(db, r, { seat, deviceId: PHONE, source: "picker" });
    if (!noName.ok) throw new Error("join failed");
    const lines = [{ itemId, variantId: null, optionIds: [], qty: 1 }];
    await expect(svc.placeCustomerOrder(db, r, PHONE, { sessionId: noName.sessionId, lines })).rejects.toMatchObject({ code: "name_required" });
    const o = await svc.placeCustomerOrder(db, r, PHONE, { sessionId: noName.sessionId, lines, customerName: "Awa" });
    expect(o).toMatchObject({ customerName: "Awa", subtotal: 2500 });
  });

  it("switches off when the owner adds tables, and back on when they are all removed", async () => {
    const db = getDb();
    const owner = { db, actor: { kind: "member" as const, userId: "it-onsite", restaurantId: r.id, role: "owner" as const }, repo: tenantRepo(db, r.id) };
    await admin.addTables(owner, { from: 1, to: 3, skip: [], areaId: null, capacity: null });
    let list = await sessions.pickerSeats(db, await reload());
    expect(list.some((s) => s.onsite)).toBe(false);
    expect(list.filter((s) => s.type === "table").map((s) => s.label)).toEqual(["1", "2", "3"]);

    for (const s of (await owner.repo.seating.seats()).filter((x) => x.type === "table")) await admin.deleteSeat(owner, s.id);
    list = await sessions.pickerSeats(db, await reload());
    expect(list.filter((s) => s.onsite)).toHaveLength(1);
  });

  it("is never offered without dine-in (takeaway / delivery only)", async () => {
    const db = getDb();
    await db.update(restaurants).set({ settings: { ...(await reload()).settings, seatingModes: ["takeaway"] } }).where(eq(restaurants.id, r.id));
    const list = await sessions.pickerSeats(db, await reload());
    expect(list.some((s) => s.onsite)).toBe(false);
    expect(list.map((s) => s.type)).toEqual(["takeaway"]);
  });
});
