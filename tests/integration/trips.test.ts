import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { closeDb, getDb } = await import("@/db");
const { tenantRepo } = await import("@/db/repos/tenant");
const { menuCategories, menuItems, members, restaurants, tableSessions } = await import("@/db/schema");
const { createRestaurantForUser } = await import("@/lib/restaurants/provision");
const buses = await import("@/lib/transport/buses");
const routes = await import("@/lib/transport/routes");
const trips = await import("@/lib/transport/trips");
const sessions = await import("@/lib/seating/sessions");
const svc = await import("@/lib/orders/service");
const rounds = await import("@/lib/transport/rounds");

const hasDb = Boolean(process.env.DATABASE_URL);
const PHONE_A = "phone-trip-aaaaaaaaaaaa";
const PHONE_B = "phone-trip-bbbbbbbbbbbb";

describe.skipIf(!hasDb)("transport: trips and bus seats (database)", () => {
  const ids: string[] = [];
  type R = typeof restaurants.$inferSelect;
  let r: R;
  let busId: string;
  let routeId: string;
  let hostess: string;
  let itemId: string;
  const owner = () => ({ db: getDb(), actor: { kind: "member" as const, userId: "it-trip-owner", restaurantId: r.id, role: "owner" as const }, repo: tenantRepo(getDb(), r.id) });
  const asHostess = (memberId: string) => ({ db: getDb(), actor: { kind: "member" as const, userId: `pin:${memberId}`, restaurantId: r.id, role: "server" as const, memberId, via: "pin" as const }, repo: tenantRepo(getDb(), r.id) });

  beforeAll(async () => {
    const db = getDb();
    r = await createRestaurantForUser(db, { clerkUserId: "it-trip-owner" }, { name: "Express Voyage Test", city: "Ouagadougou", kind: "transport" });
    ids.push(r.id);
    await db.update(restaurants).set({ published: true }).where(eq(restaurants.id, r.id));
    r = (await db.query.restaurants.findFirst({ where: eq(restaurants.id, r.id) }))!;
    busId = (await buses.createBus(owner(), { name: "Bus 7", layout: { rows: 3, left: 2, right: 2, doorRow: null, doorSide: "right", back: 0 } })).bus.id;
    routeId = (await routes.createRoute(owner(), { origin: "Ouagadougou", destination: "Bobo-Dioulasso" })).id;
    const [h] = await db.insert(members).values({ restaurantId: r.id, name: "Mariam", role: "server", staffNo: 2 }).returning();
    hostess = h!.id;
    const [c] = await db.insert(menuCategories).values({ restaurantId: r.id, name: { fr: "Repas" } }).returning();
    const [i] = await db.insert(menuItems).values({ restaurantId: r.id, categoryId: c!.id, name: { fr: "Riz gras" }, price: 2500 }).returning();
    itemId = i!.id;
  });
  afterAll(async () => {
    await getDb().delete(restaurants).where(inArray(restaurants.id, ids));
    await closeDb();
  });

  it("no order before the trip starts; a hostess only starts trips on her itineraries", async () => {
    const [seat] = await buses.busSeats(getDb(), r.id, busId);
    const joined = await sessions.joinSession(getDb(), r, { seat: { id: seat!.id, type: "seat", label: seat!.label }, deviceId: PHONE_A, source: "qr" });
    if (!joined.ok) throw new Error("join");
    await expect(svc.placeCustomerOrder(getDb(), r, PHONE_A, { sessionId: joined.sessionId, lines: [{ itemId, variantId: null, optionIds: [], qty: 1 }] })).rejects.toMatchObject({ code: "no_trip" });
    await expect(trips.startTrip(asHostess(hostess), { busId, routeId })).rejects.toMatchObject({ code: "notAssigned" });
    await routes.setRouteAssignments(owner(), routeId, [hostess]);
    const trip = await trips.startTrip(asHostess(hostess), { busId, routeId, departure: "2026-11-11T07:00" });
    expect(trip.route).toBe("Ouagadougou → Bobo-Dioulasso");
    expect(trip.departureAt.toISOString()).toBe("2026-11-11T07:00:00.000Z");
    await expect(trips.startTrip(owner(), { busId, routeId })).rejects.toMatchObject({ code: "busBusy" });
    const o = await svc.placeCustomerOrder(getDb(), r, PHONE_A, { sessionId: joined.sessionId, lines: [{ itemId, variantId: null, optionIds: [], qty: 2 }] });
    expect(o.tripId).toBe(trip.id);
    expect(o.seatLabel).toBe(seat!.label);
  });

  it("same seat on a second phone: warned, can confirm, own bill; ending the trip frees every seat", async () => {
    const [seat] = await buses.busSeats(getDb(), r.id, busId);
    const s = { id: seat!.id, type: "seat", label: seat!.label };
    expect(await sessions.joinSession(getDb(), r, { seat: s, deviceId: PHONE_B, source: "picker" })).toMatchObject({ ok: false, reason: "occupied" });
    const b = await sessions.joinSession(getDb(), r, { seat: s, deviceId: PHONE_B, source: "picker", confirmJoin: true });
    expect(b).toMatchObject({ ok: true, joined: false });
    const map = await sessions.busPicker(getDb(), r, null);
    expect(map[0]!.seats.find((x) => x.id === seat!.id)!.occupied).toBe(true);
    expect(map[0]!.trip?.route).toBe("Ouagadougou → Bobo-Dioulasso");
    const [open] = (await trips.tripsOverview(getDb(), r.id)).buses;
    const tripId = open!.open!.trip.id;

    // Phone B orders on the same seat; another traveler orders from seat 4.
    if (!b.ok) throw new Error("join b");
    await svc.placeCustomerOrder(getDb(), r, PHONE_B, { sessionId: b.sessionId, lines: [{ itemId, variantId: null, optionIds: [], qty: 1 }] });
    const seat4 = (await buses.busSeats(getDb(), r.id, busId)).find((x) => x.label === "4")!;
    const c = await sessions.joinSession(getDb(), r, { seat: { id: seat4.id, type: "seat", label: "4" }, deviceId: "phone-trip-cccccccccccc", source: "qr" });
    if (!c.ok) throw new Error("join c");
    const o4 = await svc.placeCustomerOrder(getDb(), r, "phone-trip-cccccccccccc", { sessionId: c.sessionId, lines: [{ itemId, variantId: null, optionIds: [], qty: 3 }] });

    // The hostess board: by seat number, the double flagged, totals to prepare.
    const board = await rounds.tripBoard(getDb(), r.id, tripId);
    expect(board.orders.map((o) => o.seatLabel)).toEqual([seat!.label, seat!.label, "4"]);
    expect(board.doubles).toEqual([seat!.label]);
    expect(board.toPrepare).toEqual([expect.objectContaining({ qty: 6 })]);
    expect(board.counts.toConfirm).toBe(3);

    // A round of one order, then all, then everything served.
    expect(await rounds.moveTripOrders(asHostess(hostess), tripId, "confirmed", [o4.id])).toBe(1);
    expect(await rounds.moveTripOrders(asHostess(hostess), tripId, "confirmed")).toBe(2);
    expect(await rounds.moveTripOrders(asHostess(hostess), tripId, "served")).toBe(3);
    const after = await rounds.tripBoard(getDb(), r.id, tripId);
    expect(after.toPrepare).toEqual([]);
    expect(after.orders.every((o) => o.servedBy === hostess)).toBe(true);

    await trips.endTrip(asHostess(hostess), tripId);
    const still = await getDb().select().from(tableSessions).where(eq(tableSessions.seatId, seat!.id));
    expect(still.every((x) => x.status === "closed")).toBe(true);
    expect((await sessions.busPicker(getDb(), r, null))[0]!.trip).toBeNull();
  });
});
