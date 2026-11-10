import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { closeDb, getDb } = await import("@/db");
const { tenantRepo } = await import("@/db/repos/tenant");
const { menuCategories, menuItemOptions, menuItems, menuItemVariants, restaurants, tableSessions } = await import("@/db/schema");
const sessions = await import("@/lib/seating/sessions");
const admin = await import("@/lib/seating/admin");
const svc = await import("@/lib/orders/service");
const { publicOrder } = await import("@/lib/orders/serialize");
const { orderAnalytics } = await import("@/lib/analytics/orders");
const { createRestaurantForUser } = await import("@/lib/restaurants/provision");
const { NotFoundError, ForbiddenError } = await import("@/lib/errors");

const hasDb = Boolean(process.env.DATABASE_URL);
const PHONE_A = "orderPhoneAAAAAAAAAAA";
const PHONE_B = "orderPhoneBBBBBBBBBBB";
const PHONE_C = "orderPhoneCCCCCCCCCCC";

describe.skipIf(!hasDb)("orders (database)", () => {
  type R = typeof restaurants.$inferSelect;
  const ids: string[] = [];
  let r: R;
  let other: R;
  let owner: Parameters<typeof svc.setOrderStatus>[0];
  let kitchen: Parameters<typeof svc.setOrderStatus>[0];
  let otherOwner: Parameters<typeof svc.setOrderStatus>[0];
  let rizId: string;
  let demiId: string;
  let completId: string;
  let pimentId: string;
  let bissapId: string;
  let surDemandeId: string;
  let sessionA: string;
  let table: { id: string; type: string; label: string };
  const reload = async (id: string) => (await getDb().query.restaurants.findFirst({ where: eq(restaurants.id, id) }))!;

  beforeAll(async () => {
    const db = getDb();
    r = await createRestaurantForUser(db, { clerkUserId: "it-ord-a" }, { name: "Maquis Commandes", city: "Ouagadougou" });
    other = await createRestaurantForUser(db, { clerkUserId: "it-ord-b" }, { name: "Maquis Ailleurs", city: "Ouagadougou" });
    ids.push(r.id, other.id);
    owner = { db, actor: { kind: "member", userId: "it-ord-a", restaurantId: r.id, role: "owner" }, repo: tenantRepo(db, r.id) };
    kitchen = { db, actor: { kind: "member", userId: "it-ord-k", restaurantId: r.id, role: "kitchen" }, repo: tenantRepo(db, r.id) };
    otherOwner = { db, actor: { kind: "member", userId: "it-ord-b", restaurantId: other.id, role: "owner" }, repo: tenantRepo(db, other.id) };
    const [cat] = await db.insert(menuCategories).values({ restaurantId: r.id, name: { fr: "Plats" } }).returning();
    const [riz, bissap, surDemande] = await db
      .insert(menuItems)
      .values([
        { restaurantId: r.id, categoryId: cat!.id, code: "12", name: { fr: "Riz gras" }, price: null, station: "kitchen" },
        { restaurantId: r.id, categoryId: cat!.id, code: "30", name: { fr: "Jus de bissap" }, price: 500, station: "drinks" },
        { restaurantId: r.id, categoryId: cat!.id, name: { fr: "Capitaine braisé" }, price: null, station: "grill" },
      ])
      .returning();
    rizId = riz!.id;
    bissapId = bissap!.id;
    surDemandeId = surDemande!.id;
    const [demi, complet] = await db
      .insert(menuItemVariants)
      .values([
        { restaurantId: r.id, itemId: rizId, name: { fr: "Demi" }, price: 1500 },
        { restaurantId: r.id, itemId: rizId, name: { fr: "Complet" }, price: 2500 },
      ])
      .returning();
    demiId = demi!.id;
    completId = complet!.id;
    const [piment] = await db.insert(menuItemOptions).values({ restaurantId: r.id, itemId: rizId, group: { fr: "Extras" }, name: { fr: "Piment" }, priceDelta: 100 }).returning();
    pimentId = piment!.id;
    await admin.addTables(owner, { from: 1, to: 2, skip: [], areaId: null, capacity: null });
    const seat = (await owner.repo.seating.seats()).find((s) => s.type === "table" && s.label === "1")!;
    table = { id: seat.id, type: seat.type, label: seat.label };
    const joined = await sessions.joinSession(db, r, { seat: table, deviceId: PHONE_A, source: "qr" });
    if (!joined.ok) throw new Error("join failed");
    sessionA = joined.sessionId;
  });
  afterAll(async () => {
    await getDb().delete(restaurants).where(inArray(restaurants.id, ids));
    await closeDb();
  });

  it("prices on the server from the menu, and numbers orders per day", async () => {
    const o = await svc.placeCustomerOrder(getDb(), r, PHONE_A, {
      sessionId: sessionA,
      lines: [
        { itemId: rizId, variantId: completId, optionIds: [pimentId], qty: 2, note: "sans oignon" },
        { itemId: bissapId, variantId: null, optionIds: [], qty: 3 },
        { itemId: surDemandeId, variantId: null, optionIds: [], qty: 1 },
      ],
    });
    // (2500 + 100) × 2 + 500 × 3; « sur demande » is not counted but flagged.
    expect(o.subtotal).toBe(6700);
    expect(o.hasOnRequest).toBe(true);
    expect(o.status).toBe("sent");
    expect(o.seatLabel).toBe("1");
    const second = await svc.placeCustomerOrder(getDb(), r, PHONE_A, { sessionId: sessionA, lines: [{ itemId: bissapId, variantId: null, optionIds: [], qty: 1 }] });
    expect(second.number).toBe(o.number + 1);
  });

  it("refuses bad variants, foreign options, sold-out dishes and phones not seated", async () => {
    const base = { sessionId: sessionA };
    await expect(svc.placeCustomerOrder(getDb(), r, PHONE_A, { ...base, lines: [{ itemId: rizId, variantId: null, optionIds: [], qty: 1 }] })).rejects.toMatchObject({ code: "invalid" });
    await expect(svc.placeCustomerOrder(getDb(), r, PHONE_A, { ...base, lines: [{ itemId: bissapId, variantId: null, optionIds: [pimentId], qty: 1 }] })).rejects.toMatchObject({ code: "invalid" });
    await getDb().update(menuItems).set({ soldOutUntil: new Date(Date.now() + 3600_000) }).where(eq(menuItems.id, bissapId));
    await expect(svc.placeCustomerOrder(getDb(), r, PHONE_A, { ...base, lines: [{ itemId: bissapId, variantId: null, optionIds: [], qty: 1 }] })).rejects.toMatchObject({
      code: "unavailable",
      itemIds: [bissapId],
    });
    await getDb().update(menuItems).set({ soldOutUntil: null }).where(eq(menuItems.id, bissapId));
    // A phone that never joined this table cannot order on it.
    await expect(svc.placeCustomerOrder(getDb(), r, PHONE_C, { ...base, lines: [{ itemId: bissapId, variantId: null, optionIds: [], qty: 1 }] })).rejects.toMatchObject({ code: "no_seat" });
    // Another restaurant's dish is simply unknown here.
    const [foreignCat] = await getDb().insert(menuCategories).values({ restaurantId: other.id, name: { fr: "X" } }).returning();
    const [foreign] = await getDb().insert(menuItems).values({ restaurantId: other.id, categoryId: foreignCat!.id, name: { fr: "Ailleurs" }, price: 100 }).returning();
    await expect(svc.placeCustomerOrder(getDb(), r, PHONE_A, { ...base, lines: [{ itemId: foreign!.id, variantId: null, optionIds: [], qty: 1 }] })).rejects.toMatchObject({ code: "unavailable" });
  });

  it("group ordering: a second phone at the table sees the whole table bill, others only their own", async () => {
    const joined = await sessions.joinSession(getDb(), r, { seat: table, deviceId: PHONE_B, source: "qr" });
    expect(joined.ok && joined.joined).toBe(true);
    await svc.placeCustomerOrder(getDb(), r, PHONE_B, { sessionId: sessionA, lines: [{ itemId: bissapId, variantId: null, optionIds: [], qty: 2 }] });
    const b = await svc.ordersForCustomer(getDb(), r.id, PHONE_B, sessionA);
    expect(b.sharedSessionId).toBe(sessionA);
    expect(b.orders).toHaveLength(3);
    const c = await svc.ordersForCustomer(getDb(), r.id, PHONE_C, sessionA);
    expect(c.orders).toHaveLength(0);
  });

  it("moves through the board with the right permissions, and refuses stale moves", async () => {
    const [o] = (await svc.serviceOrders(owner)).filter((x) => x.status === "sent");
    await expect(svc.setOrderStatus(kitchen, o!.id, "confirmed")).rejects.toBeInstanceOf(ForbiddenError);
    await svc.setOrderStatus(owner, o!.id, "confirmed");
    await expect(svc.setOrderStatus(owner, o!.id, "confirmed")).rejects.toMatchObject({ code: "conflict" });
    // Kitchen marks dishes one by one; the order follows.
    const items = (await svc.getOrder(kitchen, o!.id)).items;
    await svc.setItemStatus(kitchen, o!.id, items[0]!.id, "preparing");
    expect((await svc.getOrder(owner, o!.id)).status).toBe("preparing");
    for (const it of items) await svc.setItemStatus(kitchen, o!.id, it.id, "ready");
    const ready = await svc.getOrder(owner, o!.id);
    expect(ready.status).toBe("ready");
    expect(ready.readyAt).not.toBeNull();
    await svc.setOrderStatus(owner, o!.id, "served");
    const served = await svc.getOrder(owner, o!.id);
    expect(served.items.every((i) => i.status === "served")).toBe(true);
    await expect(svc.setOrderStatus(owner, o!.id, "cancelled")).rejects.toMatchObject({ code: "reason_required" });
  });

  it("never shows or changes another restaurant's orders", async () => {
    const [o] = await svc.serviceOrders(owner);
    expect(await svc.serviceOrders(otherOwner)).toHaveLength(0);
    await expect(svc.getOrder(otherOwner, o!.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(svc.setOrderStatus(otherOwner, o!.id, "cancelled", "test")).rejects.toBeInstanceOf(NotFoundError);
    await expect(svc.setItemStatus(otherOwner, o!.id, o!.items[0]!.id, "ready")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a table with orders in progress is not closed by idle sweeps or phones leaving", async () => {
    await getDb().update(tableSessions).set({ lastActivityAt: new Date(Date.now() - 6 * 3600_000) }).where(eq(tableSessions.id, sessionA));
    await sessions.sweepStale(getDb(), await reload(r.id));
    await sessions.leaveSession(getDb(), r.id, sessionA, PHONE_A, "released");
    await sessions.leaveSession(getDb(), r.id, sessionA, PHONE_B, "released");
    const s = await getDb().query.tableSessions.findFirst({ where: eq(tableSessions.id, sessionA) });
    expect(s?.status).toBe("open");
  });

  it("direct mode sends orders straight to the kitchen; takeaway needs a name", async () => {
    await getDb().update(restaurants).set({ settings: { ...r.settings, orderValidation: "direct", seatingModes: ["table", "takeaway"] } }).where(eq(restaurants.id, r.id));
    await admin.syncSingletonSeats(getDb(), r.id, ["table", "takeaway"]);
    const fresh = await reload(r.id);
    const take = (await owner.repo.seating.seats()).find((s) => s.type === "takeaway")!;
    const j = await sessions.joinSession(getDb(), fresh, { seat: { id: take.id, type: take.type, label: take.label }, deviceId: PHONE_C, source: "picker" });
    if (!j.ok) throw new Error("join");
    const line = [{ itemId: bissapId, variantId: null, optionIds: [], qty: 1 }];
    await expect(svc.placeCustomerOrder(getDb(), fresh, PHONE_C, { sessionId: j.sessionId, lines: line })).rejects.toMatchObject({ code: "name_required" });
    const o = await svc.placeCustomerOrder(getDb(), fresh, PHONE_C, { sessionId: j.sessionId, lines: line, customerName: "Awa" });
    expect(o.status).toBe("confirmed");
    expect(o.confirmedAt).not.toBeNull();
    // Takeaway customers share the seat but never see each other's orders.
    const mine = await svc.ordersForCustomer(getDb(), r.id, PHONE_C, j.sessionId);
    expect(mine.sharedSessionId).toBeNull();
    expect(mine.orders.map((x) => x.id)).toEqual([o.id]);
  });

  const PHONE_D = "orderPhoneDDDDDDDDDDD";
  const PHONE_E = "orderPhoneEEEEEEEEEEE";
  const seatOf = async (type: string, label?: string) => {
    const s = (await owner.repo.seating.seats()).find((x) => x.type === type && (label === undefined || x.label === label))!;
    return { id: s.id, type: s.type, label: s.label };
  };
  const bissap = () => [{ itemId: bissapId, variantId: null, optionIds: [], qty: 1 }];

  it("takeaway is one seat shared by unrelated customers: never « occupied », never « joined »", async () => {
    const fresh = await reload(r.id);
    const take = await seatOf("takeaway");
    const d = await sessions.joinSession(getDb(), fresh, { seat: take, deviceId: PHONE_D, source: "picker" });
    const e = await sessions.joinSession(getDb(), fresh, { seat: take, deviceId: PHONE_E, source: "picker" });
    expect(d.ok && e.ok).toBe(true);
    expect(e.ok && e.joined).toBe(false);
    const picker = await sessions.pickerSeats(getDb(), fresh);
    expect(picker.find((s) => s.type === "takeaway")?.occupied).toBe(false);
  });

  it("inactivity release never frees a picker table that has ordered; the long idle rule still applies", async () => {
    const fresh = await reload(r.id);
    const t2 = await seatOf("table", "2");
    const j = await sessions.joinSession(getDb(), fresh, { seat: t2, deviceId: PHONE_D, source: "picker", confirmJoin: true });
    if (!j.ok) throw new Error("join");
    const o = await svc.placeCustomerOrder(getDb(), fresh, PHONE_D, { sessionId: j.sessionId, lines: bissap() });
    await svc.setOrderStatus(owner, o.id, "served");
    const status = async () => (await getDb().query.tableSessions.findFirst({ where: eq(tableSessions.id, j.sessionId) }))!.status;
    // Ten quiet minutes while eating: the table stays theirs (the phone holds it too).
    await sessions.sweepStale(getDb(), fresh, new Date(Date.now() + 10 * 60_000));
    expect(await status()).toBe("open");
    // Hours later with nothing in progress: closed like any idle table.
    await sessions.sweepStale(getDb(), fresh, new Date(Date.now() + 5 * 3600_000));
    expect(await status()).toBe("closed");
  });

  it("two cooks finishing the last dishes at the same time leave the order « prête »", async () => {
    const fresh = await reload(r.id);
    const t2 = await seatOf("table", "2");
    const j = await sessions.joinSession(getDb(), fresh, { seat: t2, deviceId: PHONE_E, source: "qr" });
    if (!j.ok) throw new Error("join");
    for (let round = 0; round < 4; round++) {
      const placed = await svc.placeCustomerOrder(getDb(), fresh, PHONE_E, {
        sessionId: j.sessionId,
        lines: [
          { itemId: bissapId, variantId: null, optionIds: [], qty: 1 },
          { itemId: rizId, variantId: demiId, optionIds: [], qty: 1 },
          { itemId: surDemandeId, variantId: null, optionIds: [], qty: 1 },
        ],
      });
      const o = await svc.getOrder(owner, placed.id);
      await svc.setItemStatus(kitchen, o.id, o.items[0]!.id, "ready");
      await Promise.all(o.items.slice(1).map((i) => svc.setItemStatus(kitchen, o.id, i.id, "ready")));
      const after = await svc.getOrder(owner, o.id);
      expect(after.items.every((i) => i.status === "ready")).toBe(true);
      expect(after.status).toBe("ready");
      expect(after.readyAt).not.toBeNull();
    }
  });

  it("the table bill counts this table's orders, not the phone's earlier visits of the day", async () => {
    await admin.addTables(owner, { from: 3, to: 3, skip: [], areaId: null, capacity: null });
    const fresh = await reload(r.id);
    const t3 = await seatOf("table", "3");
    // PHONE_A already ordered at table 1 earlier today.
    const j = await sessions.joinSession(getDb(), fresh, { seat: t3, deviceId: PHONE_A, source: "qr" });
    if (!j.ok) throw new Error("join");
    const o = await svc.placeCustomerOrder(getDb(), fresh, PHONE_A, { sessionId: j.sessionId, lines: bissap() });
    const res = await svc.ordersForCustomer(getDb(), r.id, PHONE_A, j.sessionId);
    expect(res.currentSessionId).toBe(j.sessionId);
    const list = res.orders.map((x) => publicOrder(x, PHONE_A, res.currentSessionId));
    expect(list.length).toBeGreaterThan(1);
    expect(list.filter((x) => x.current).map((x) => x.id)).toEqual([o.id]);
    expect(list.find((x) => x.id !== o.id)?.current).toBe(false);
    // Without a session (not seated), nothing is « current ».
    const away = await svc.ordersForCustomer(getDb(), r.id, PHONE_A, null);
    expect(away.orders.map((x) => publicOrder(x, PHONE_A, away.currentSessionId)).some((x) => x.current)).toBe(false);
  });

  it("analytics: service time ignores orders cancelled after being served; busy hours are Ouagadougou hours", async () => {
    const db = getDb();
    await admin.addTables(otherOwner, { from: 1, to: 1, skip: [], areaId: null, capacity: null });
    const [cat] = await db.insert(menuCategories).values({ restaurantId: other.id, name: { fr: "Boissons" } }).returning();
    const [dish] = await db.insert(menuItems).values({ restaurantId: other.id, categoryId: cat!.id, name: { fr: "Jus de gingembre" }, price: 700 }).returning();
    const seat = (await otherOwner.repo.seating.seats()).find((s) => s.type === "table" && s.label === "1")!;
    const j = await sessions.joinSession(db, other, { seat: { id: seat.id, type: seat.type, label: seat.label }, deviceId: PHONE_D, source: "qr" });
    if (!j.ok) throw new Error("join");
    const now = new Date();
    const line = [{ itemId: dish!.id, variantId: null, optionIds: [], qty: 1 }];
    const kept = await svc.placeCustomerOrder(db, other, PHONE_D, { sessionId: j.sessionId, lines: line }, new Date(now.getTime() - 20 * 60_000));
    await svc.setOrderStatus(otherOwner, kept.id, "confirmed", undefined, new Date(now.getTime() - 20 * 60_000));
    await svc.setOrderStatus(otherOwner, kept.id, "served", undefined, now);
    const voided = await svc.placeCustomerOrder(db, other, PHONE_D, { sessionId: j.sessionId, lines: line }, new Date(now.getTime() - 90 * 60_000));
    await svc.setOrderStatus(otherOwner, voided.id, "confirmed", undefined, new Date(now.getTime() - 90 * 60_000));
    await svc.setOrderStatus(otherOwner, voided.id, "served", undefined, now);
    await svc.setOrderStatus(otherOwner, voided.id, "cancelled", "erreur de caisse", now);
    // Only orders from the last 2 hours, so the test also works just after midnight.
    const a = await orderAnalytics(db, other.id, "7d", now);
    expect(a.served).toBe(1);
    expect(a.cancelled).toBe(1);
    expect(a.avgServiceMin).toBe(20);
    // Even if the database connection uses another time zone, hours are Ouagadougou (UTC) hours.
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local time zone 'America/New_York'`);
      const b = await orderAnalytics(tx as unknown as typeof db, other.id, "7d", now);
      const sentHour = new Date(now.getTime() - 20 * 60_000).getUTCHours();
      expect(b.byHour[sentHour]).toBeGreaterThanOrEqual(1);
      expect(b.byHour.reduce((s, c) => s + c, 0)).toBe(1);
    });
  });
});
