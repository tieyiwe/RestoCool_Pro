import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { closeDb, getDb } = await import("@/db");
const { tenantRepo } = await import("@/db/repos/tenant");
const { members, menuCategories, menuItems, orders, restaurants, tableSessions } = await import("@/db/schema");
const sessions = await import("@/lib/seating/sessions");
const admin = await import("@/lib/seating/admin");
const svc = await import("@/lib/orders/service");
const { placeStaffOrder } = await import("@/lib/orders/staff-order");
const asg = await import("@/lib/assignments");
const { myTables } = await import("@/lib/service/my-tables");
const { createRestaurantForUser } = await import("@/lib/restaurants/provision");
const { ForbiddenError, NotFoundError } = await import("@/lib/errors");

const hasDb = Boolean(process.env.DATABASE_URL);
const PHONE = "staffSvcPhoneAAAAAAAAA";

describe.skipIf(!hasDb)("table assignments, staff-entered orders and « Mes tables » (database)", () => {
  type R = typeof restaurants.$inferSelect;
  type Ctx = Parameters<typeof svc.serviceOrders>[0];
  const ids: string[] = [];
  let r: R;
  let other: R;
  let owner: Ctx;
  let awa: Ctx;
  let ali: Ctx;
  let kitchen: Ctx;
  let otherOwner: Ctx;
  let awaId: string;
  let aliId: string;
  let rizId: string;
  const seat = async (label: string) => (await owner.repo.seating.seats()).find((s) => s.type === "table" && s.label === label)!;

  beforeAll(async () => {
    const db = getDb();
    r = await createRestaurantForUser(db, { clerkUserId: "it-staffsvc-a" }, { name: "Maquis Affectations", city: "Ouagadougou" });
    other = await createRestaurantForUser(db, { clerkUserId: "it-staffsvc-b" }, { name: "Maquis Affectations Voisin", city: "Ouagadougou" });
    ids.push(r.id, other.id);
    const [a, b] = await db
      .insert(members)
      .values([
        { restaurantId: r.id, name: "Awa", role: "server", staffNo: 2 },
        { restaurantId: r.id, name: "Ali", role: "server", staffNo: 3 },
      ])
      .returning();
    awaId = a!.id;
    aliId = b!.id;
    owner = { db, actor: { kind: "member", userId: "it-staffsvc-a", restaurantId: r.id, role: "owner" }, repo: tenantRepo(db, r.id) };
    awa = { db, actor: { kind: "member", userId: `pin:${awaId}`, memberId: awaId, via: "pin", restaurantId: r.id, role: "server" }, repo: tenantRepo(db, r.id) };
    ali = { db, actor: { kind: "member", userId: `pin:${aliId}`, memberId: aliId, via: "pin", restaurantId: r.id, role: "server" }, repo: tenantRepo(db, r.id) };
    kitchen = { db, actor: { kind: "member", userId: "it-staffsvc-k", restaurantId: r.id, role: "kitchen" }, repo: tenantRepo(db, r.id) };
    otherOwner = { db, actor: { kind: "member", userId: "it-staffsvc-b", restaurantId: other.id, role: "owner" }, repo: tenantRepo(db, other.id) };
    const [cat] = await db.insert(menuCategories).values({ restaurantId: r.id, name: { fr: "Plats" } }).returning();
    const [riz] = await db.insert(menuItems).values({ restaurantId: r.id, categoryId: cat!.id, name: { fr: "Riz gras" }, price: 2500 }).returning();
    rizId = riz!.id;
    await admin.addTables(owner, { from: 1, to: 4, skip: [], areaId: null, capacity: null });
  });
  afterAll(async () => {
    await getDb().delete(restaurants).where(inArray(restaurants.id, ids));
    await closeDb();
  });

  it("only managers plan the day; a table has one server; orders go to the table's server", async () => {
    const t1 = await seat("1");
    const t2 = await seat("2");
    await expect(asg.setAssignments(awa, { memberId: awaId, seatIds: [t1.id], areaIds: [] })).rejects.toBeInstanceOf(ForbiddenError);
    await asg.setAssignments(owner, { memberId: awaId, seatIds: [t1.id, t2.id], areaIds: [] });
    // Giving table 2 to Ali takes it from Awa.
    await asg.setAssignments(owner, { memberId: aliId, seatIds: [t2.id], areaIds: [] });
    const plan = await asg.dayAssignments(owner);
    expect(plan.people.find((p) => p.id === awaId)?.seatIds).toEqual([t1.id]);
    expect(plan.people.find((p) => p.id === aliId)?.seatIds).toEqual([t2.id]);
    // Another business's seats are ignored.
    const foreign = (await otherOwner.repo.seating.seats())[0];
    if (foreign) {
      await asg.setAssignments(owner, { memberId: aliId, seatIds: [t2.id, foreign.id], areaIds: [] });
      expect((await asg.dayAssignments(owner)).people.find((p) => p.id === aliId)?.seatIds).toEqual([t2.id]);
    }

    const j = await sessions.joinSession(getDb(), r, { seat: { id: t1.id, type: t1.type, label: t1.label }, deviceId: PHONE, source: "qr" });
    if (!j.ok) throw new Error("join");
    const o = await svc.placeCustomerOrder(getDb(), r, PHONE, { sessionId: j.sessionId, lines: [{ itemId: rizId, variantId: null, optionIds: [], qty: 1 }] });
    expect(o.assignedStaffId).toBe(awaId);

    // « Mes tables »: Awa sees table 1 and its new order; Ali does not.
    const mine = await myTables(awa);
    expect(mine.assigned).toBe(true);
    expect(mine.tables.map((x) => x.label)).toEqual(["1"]);
    if (o.status === "sent") expect(mine.toConfirm.map((x) => x.id)).toContain(o.id);
    const his = await myTables(ali);
    expect(his.tables.map((x) => x.label)).toEqual(["2"]);
    expect(his.toConfirm.map((x) => x.id)).not.toContain(o.id);

    // A manager moves the order to Ali.
    await expect(asg.reassignOrder(awa, o.id, aliId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(asg.reassignOrder(otherOwner, o.id, null)).rejects.toBeInstanceOf(NotFoundError);
    await asg.reassignOrder(owner, o.id, aliId);
    const [moved] = await getDb().select({ a: orders.assignedStaffId }).from(orders).where(eq(orders.id, o.id));
    expect(moved?.a).toBe(aliId);
  });

  it("a server takes an order for a customer: confirmed in their name, on the table's bill, never twice", async () => {
    const t3 = await seat("3");
    await expect(placeStaffOrder(kitchen, r, { seatId: t3.id, lines: [{ itemId: rizId, variantId: null, optionIds: [], qty: 1 }], requestId: "staff-order-kitchen-01" })).rejects.toBeInstanceOf(ForbiddenError);
    const input = { seatId: t3.id, lines: [{ itemId: rizId, variantId: null, optionIds: [], qty: 2, note: "sans piment" }], requestId: "staff-order-awa-000001" };
    const o = await placeStaffOrder(awa, r, input);
    expect(o).toMatchObject({ source: "staff", status: "confirmed", takenBy: awaId, confirmedBy: awaId, subtotal: 5000, seatLabel: "3" });
    // Table 3 has nobody assigned: the order goes to the one who took it.
    expect(o.assignedStaffId).toBe(awaId);
    const [sess] = await getDb().select().from(tableSessions).where(eq(tableSessions.id, o.sessionId!));
    expect(sess).toMatchObject({ status: "open", source: "staff" });
    // The same request again (lost answer) gives back the same order.
    expect((await placeStaffOrder(awa, r, input)).id).toBe(o.id);
    // A seat of another business is unknown.
    const foreign = (await otherOwner.repo.seating.seats())[0];
    if (foreign) await expect(placeStaffOrder(awa, r, { ...input, seatId: foreign.id, requestId: "staff-order-foreign-01" })).rejects.toMatchObject({ code: "no_seat" });
  });

  it("copying yesterday's plan does nothing when today already has one", async () => {
    expect(await asg.copyYesterday(owner)).toBe(0);
  });
});
