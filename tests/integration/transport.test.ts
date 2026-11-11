import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { closeDb, getDb } = await import("@/db");
const { tenantRepo } = await import("@/db/repos/tenant");
const { accessCodes, members, restaurants, seats } = await import("@/db/schema");
const { createRestaurantForUser } = await import("@/lib/restaurants/provision");
const buses = await import("@/lib/transport/buses");
const routes = await import("@/lib/transport/routes");
const { ForbiddenError, NotFoundError } = await import("@/lib/errors");

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("transport: buses and itineraries (database)", () => {
  const ids: string[] = [];
  type R = typeof restaurants.$inferSelect;
  let r: R;
  let other: R;
  const ctx = (rest: R, role: "owner" | "server" = "owner") => ({ db: getDb(), actor: { kind: "member" as const, userId: `it-tr-${rest.slug}`, restaurantId: rest.id, role }, repo: tenantRepo(getDb(), rest.id) });

  beforeAll(async () => {
    r = await createRestaurantForUser(getDb(), { clerkUserId: "it-tr-a" }, { name: "Express Démo Test", city: "Ouagadougou", kind: "transport" });
    other = await createRestaurantForUser(getDb(), { clerkUserId: "it-tr-b" }, { name: "Autre Compagnie Test", city: "Ouagadougou", kind: "transport" });
    ids.push(r.id, other.id);
  });
  afterAll(async () => {
    await getDb().delete(restaurants).where(inArray(restaurants.id, ids));
    await closeDb();
  });

  it("a transport business is set up for seat-back QR codes and hostess confirmation", () => {
    expect(r.kind).toBe("transport");
    expect(r.settings.qrStrategy).toBe("per_seat");
    expect(r.settings.orderValidation).toBe("server_confirms");
  });

  it("a bus gets its seats from the layout, each with a QR token and an RC number; numbers repeat across buses", async () => {
    const elitis = { rows: 12, left: 2, right: 2, doorRow: 7, doorSide: "right" as const, back: 4 };
    const a = await buses.createBus(ctx(r), { name: "Bus 12", layout: elitis });
    const b = await buses.createBus(ctx(r), { name: "Bus 14", layout: { ...elitis, doorRow: null } });
    expect(a.seats).toBe(50);
    expect(b.seats).toBe(52);
    const list = await buses.busSeats(getDb(), r.id, a.bus.id);
    expect(list.find((s) => s.label === "1")).toMatchObject({ row: 1, col: 0, position: "window" });
    const codes = await getDb().select().from(accessCodes).where(inArray(accessCodes.seatId, list.map((s) => s.id)));
    expect(codes).toHaveLength(50);
    await expect(buses.createBus(ctx(r), { name: "bus 12", layout: elitis })).rejects.toMatchObject({ code: "duplicate" });
    await expect(buses.createBus(ctx(r, "server"), { name: "Bus 99", layout: elitis })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("changing the layout keeps the printed QR of seats that still exist", async () => {
    const [bus] = await buses.listBuses(getDb(), r.id);
    const before = await buses.busSeats(getDb(), r.id, bus!.id);
    const token1 = before.find((s) => s.label === "1")!.qrToken;
    // One row fewer: seats 47-50 renumbered region changes, seat 1 stays.
    const n = await buses.updateBusLayout(ctx(r), bus!.id, { rows: 11, left: 2, right: 2, doorRow: 7, doorSide: "right", back: 4 });
    expect(n).toBe(46);
    const after = await buses.busSeats(getDb(), r.id, bus!.id);
    expect(after.find((s) => s.label === "1")!.qrToken).toBe(token1);
    expect(after.some((s) => s.label === "50")).toBe(false);
    // Another business can't touch it.
    await expect(buses.updateBusLayout(ctx(other), bus!.id, bus!.layout)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("itineraries with hostesses assigned; never people from another business", async () => {
    const db = getDb();
    const [awa] = await db.insert(members).values({ restaurantId: r.id, name: "Awa hôtesse", role: "server", staffNo: 2 }).returning();
    const [foreign] = await db.insert(members).values({ restaurantId: other.id, name: "Ailleurs", role: "server", staffNo: 2 }).returning();
    const ob = await routes.createRoute(ctx(r), { origin: "Ouagadougou", destination: "Bobo-Dioulasso" });
    await expect(routes.createRoute(ctx(r), { origin: "ouagadougou", destination: "bobo-dioulasso" })).rejects.toMatchObject({ code: "duplicate" });
    await expect(routes.createRoute(ctx(r), { origin: "Kaya", destination: "kaya" })).rejects.toMatchObject({ code: "invalid" });
    await routes.setRouteAssignments(ctx(r), ob.id, [awa!.id, foreign!.id]);
    const [listed] = await routes.listRoutes(db, r.id);
    expect(listed!.label).toBe("Ouagadougou → Bobo-Dioulasso");
    expect(listed!.people.map((p) => p.memberId)).toEqual([awa!.id]);
    expect((await routes.routesOfMember(db, r.id, awa!.id)).map((x) => x.id)).toEqual([ob.id]);
    await expect(routes.setRouteAssignments(ctx(other), ob.id, [])).rejects.toBeInstanceOf(NotFoundError);
    expect(await db.select().from(seats).where(and(eq(seats.restaurantId, other.id)))).toHaveLength(0);
  });
});
