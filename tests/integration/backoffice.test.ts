import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { closeDb, getDb } = await import("@/db");
const { attendance, members, orders, restaurants } = await import("@/db/schema");
const { createRestaurantForUser } = await import("@/lib/restaurants/provision");
const { personnelRanking, liveStatus } = await import("@/lib/analytics/backoffice");
const { orderHistory } = await import("@/lib/orders/history");

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("back office figures (database)", () => {
  const ids: string[] = [];
  afterAll(async () => {
    await getDb().delete(restaurants).where(inArray(restaurants.id, ids));
    await closeDb();
  });

  it("ranks personnel by work, presence and app use; history filters by person; other restaurants never count", async () => {
    const db = getDb();
    const r = await createRestaurantForUser(db, { clerkUserId: "it-bo-owner" }, { name: "Maquis Classement", city: "Ouagadougou" });
    const other = await createRestaurantForUser(db, { clerkUserId: "it-bo-other" }, { name: "Maquis Voisin", city: "Ouagadougou" });
    ids.push(r.id, other.id);
    const [awa, issa] = await db
      .insert(members)
      .values([
        { restaurantId: r.id, name: "Awa", role: "server", staffNo: 2 },
        { restaurantId: r.id, name: "Issa", role: "kitchen", staffNo: 3 },
      ])
      .returning();
    const today = new Date().toISOString().slice(0, 10);
    const base = { restaurantId: r.id, businessDate: today, validationMode: "server_confirms" as const, subtotal: 2000 };
    await db.insert(orders).values([
      { ...base, number: 1, status: "served", confirmedBy: awa!.id, servedBy: awa!.id, preparedBy: issa!.id, seatLabel: "Table 4" },
      { ...base, number: 2, status: "served", servedBy: awa!.id, seatLabel: "Table 5" },
      { ...base, number: 3, status: "sent", seatLabel: "Terrasse" },
    ]);
    // The neighbour's orders name Awa too: they must not count for her.
    await db.insert(orders).values({ ...base, restaurantId: other.id, number: 1, status: "served", servedBy: awa!.id });
    await db.insert(attendance).values({ restaurantId: r.id, memberId: issa!.id, checkInAt: new Date(Date.now() - 3 * 3600_000), inMethod: "manager" });

    const ranking = await personnelRanking(db, r.id, "today");
    expect(ranking.map((p) => p.name)).toEqual(["Awa", "Issa"]);
    expect(ranking[0]).toMatchObject({ served: 2, confirmed: 1, score: 2 * 3 + 2, rank: 1 });
    expect(ranking[1]).toMatchObject({ prepared: 1, days: 1, rank: 2 });
    expect(ranking[1]!.minutes).toBeGreaterThanOrEqual(179);

    const live = await liveStatus(db, r.id);
    expect(live).toMatchObject({ openOrders: 1, ordersToday: 3, revenueToday: 4000, present: 1 });

    const mine = await orderHistory(db, r.id, { range: "today", status: "all", q: "", staff: awa!.id });
    expect(mine.rows.map((o) => o.number).sort()).toEqual([1, 2]);
    expect(mine.total).toBe(4000);
    expect((await orderHistory(db, r.id, { range: "today", status: "open", q: "", staff: undefined })).rows.map((o) => o.number)).toEqual([3]);
    expect((await orderHistory(db, r.id, { range: "today", status: "all", q: "table 5", staff: undefined })).rows.map((o) => o.number)).toEqual([2]);
    expect((await orderHistory(db, r.id, { range: "today", status: "all", q: "#1", staff: undefined })).rows.map((o) => o.number)).toEqual([1]);
  });
});
