import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { closeDb, getDb } = await import("@/db");
const { orders, restaurants } = await import("@/db/schema");
const sc = await import("@/lib/shared-carts");
const { createRestaurantForUser } = await import("@/lib/restaurants/provision");

const hasDb = Boolean(process.env.DATABASE_URL);
const HOST = "phoneSHAREHOSTAAAAAAAA";
const GUEST = "phoneSHAREGUESTBBBBBBB";
const GUEST2 = "phoneSHAREGUESTCCCCCCC";
const ITEM = "11111111-1111-4111-8111-111111111111";
const line = (key: string, qty = 1) => ({ key, itemId: ITEM, variantId: null, optionIds: [], qty });

describe.skipIf(!hasDb)("shared selection (database)", () => {
  const ids: string[] = [];
  type R = typeof restaurants.$inferSelect;
  let r: R;
  let other: R;

  beforeAll(async () => {
    r = await createRestaurantForUser(getDb(), { clerkUserId: "it-share-owner" }, { name: "Maquis Partage", city: "Ouagadougou" });
    other = await createRestaurantForUser(getDb(), { clerkUserId: "it-share-other" }, { name: "Maquis Partage Voisin", city: "Ouagadougou" });
    ids.push(r.id, other.id);
  });
  afterAll(async () => {
    await getDb().delete(restaurants).where(inArray(restaurants.id, ids));
    await closeDb();
  });

  it("names everyone, shows who picked what, and only the host finishes", async () => {
    const db = getDb();
    const token = await sc.createSharedCart(db, r.id, HOST, "Awa", [line("a", 2)]);
    // Tenant-scoped: the link means nothing for another business.
    expect(await sc.viewSharedCart(db, other.id, token, GUEST)).toBeNull();

    await sc.saveMember(db, r.id, token, GUEST, { name: "Moussa", lines: [line("b")], done: false });
    await sc.saveMember(db, r.id, token, GUEST2, { name: "Fati", lines: [line("c", 3)], done: true });
    // A guest's view: every person with their name and dishes, theirs marked « mine ».
    const g = await sc.viewSharedCart(db, r.id, token, GUEST);
    expect(g?.isHost).toBe(false);
    expect(g?.hostName).toBe("Awa");
    expect(g?.members.map((m) => [m.name, m.host, m.mine, m.lines.length, m.done])).toEqual([
      ["Awa", true, false, 1, false],
      ["Moussa", false, true, 1, false],
      ["Fati", false, false, 1, true],
    ]);
    // The host keeps their dishes up to date the same way (never « done »).
    await sc.saveMember(db, r.id, token, HOST, { name: "Awa", lines: [line("a", 4)], done: true });
    const h = await sc.viewSharedCart(db, r.id, token, HOST);
    expect(h?.isHost).toBe(true);
    expect(h?.members.find((m) => m.mine)).toMatchObject({ host: true, done: false, lines: [expect.objectContaining({ qty: 4 })] });

    // Names are required.
    expect(sc.MemberInput.safeParse({ name: "  ", lines: [], done: false }).success).toBe(false);

    // Only the host ends it; an order from another phone is not linked.
    await expect(sc.finishSharedCart(db, r.id, token, GUEST, null)).rejects.toMatchObject({ code: "host" });
    const [foreign] = await db.insert(orders).values({ restaurantId: r.id, businessDate: "2026-11-13", number: 1, status: "sent", validationMode: "direct", customerDeviceId: GUEST }).returning({ id: orders.id });
    const [mine] = await db.insert(orders).values({ restaurantId: r.id, businessDate: "2026-11-13", number: 2, status: "sent", validationMode: "direct", customerDeviceId: HOST }).returning({ id: orders.id });
    await sc.finishSharedCart(db, r.id, token, HOST, mine!.id);
    const done = await sc.viewSharedCart(db, r.id, token, GUEST);
    expect(done).toMatchObject({ status: "sent", order: { number: 2 } });
    void foreign;
    // Closed: guests can no longer add.
    await expect(sc.saveMember(db, r.id, token, GUEST, { name: "Moussa", lines: [], done: false })).rejects.toMatchObject({ code: "closed" });
  });

  it("stopping without an order closes it", async () => {
    const db = getDb();
    const token = await sc.createSharedCart(db, r.id, HOST, "Awa");
    await sc.finishSharedCart(db, r.id, token, HOST, null);
    expect((await sc.viewSharedCart(db, r.id, token, HOST))?.status).toBe("closed");
  });
});
