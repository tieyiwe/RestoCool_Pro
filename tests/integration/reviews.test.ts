import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { closeDb, getDb } = await import("@/db");
const { orders, restaurants, reviews } = await import("@/db/schema");
const rv = await import("@/lib/reviews");
const { createRestaurantForUser } = await import("@/lib/restaurants/provision");
const { NotFoundError } = await import("@/lib/errors");

const hasDb = Boolean(process.env.DATABASE_URL);
const PHONE = "phoneREVIEWAAAAAAAAAA";
const OTHER = "phoneREVIEWBBBBBBBBBB";

describe.skipIf(!hasDb)("customer reviews (database)", () => {
  const ids: string[] = [];
  type R = typeof restaurants.$inferSelect;
  let r: R;
  let other: R;
  let n = 1;
  const order = async (rest: R, device: string, status: "sent" | "served" | "paid") => {
    const [o] = await getDb()
      .insert(orders)
      .values({ restaurantId: rest.id, businessDate: "2026-11-13", number: n++, status, validationMode: "direct", customerDeviceId: device })
      .returning({ id: orders.id });
    return o!.id;
  };
  const owner = () => ({ db: getDb(), actor: { kind: "member" as const, userId: "it-rev-owner", restaurantId: r.id, role: "owner" as const }, restaurantId: r.id });

  beforeAll(async () => {
    r = await createRestaurantForUser(getDb(), { clerkUserId: "it-rev-owner" }, { name: "Maquis Avis", city: "Ouagadougou" });
    other = await createRestaurantForUser(getDb(), { clerkUserId: "it-rev-other" }, { name: "Maquis Avis Voisin", city: "Ouagadougou" });
    ids.push(r.id, other.id);
  });
  afterAll(async () => {
    await getDb().delete(restaurants).where(inArray(restaurants.id, ids));
    await closeDb();
  });

  it("only a served customer reviews, once per order, from the phone that ordered", async () => {
    const db = getDb();
    const notYet = await order(r, PHONE, "sent");
    await expect(rv.submitReview(db, r, PHONE, { orderId: notYet, rating: 5, lang: "fr" })).rejects.toMatchObject({ code: "not_served" });
    const served = await order(r, PHONE, "served");
    await expect(rv.submitReview(db, r, OTHER, { orderId: served, rating: 1, lang: "fr" })).rejects.toMatchObject({ code: "not_served" });
    const foreign = await order(other, PHONE, "served");
    await expect(rv.submitReview(db, r, PHONE, { orderId: foreign, rating: 1, lang: "fr" })).rejects.toMatchObject({ code: "not_served" });
    await rv.submitReview(db, r, PHONE, { orderId: served, rating: 5, comment: "Excellent riz gras", authorName: "Awa", lang: "fr" });
    await expect(rv.submitReview(db, r, PHONE, { orderId: served, rating: 1, lang: "fr" })).rejects.toMatchObject({ code: "already" });
    const paid = await order(r, OTHER, "paid");
    await rv.submitReview(db, r, OTHER, { orderId: paid, rating: 1, comment: "Trop lent", lang: "fr" });

    const pub = await rv.publicReviews(db, r.id, { deviceId: PHONE });
    expect(pub.summary).toMatchObject({ count: 2, average: 3 });
    expect(pub.reviewed).toEqual([served]);
    const [row] = await db.select().from(reviews).where(eq(reviews.orderId, served));
    expect(row!.deviceHash).not.toContain(PHONE); // only a hash of the device is stored
  });

  it("the business hides or deletes a review: gone from its page; the platform keeps everything", async () => {
    const db = getDb();
    const low = (await db.select().from(reviews).where(eq(reviews.restaurantId, r.id))).find((x) => x.rating === 1)!;
    // Kitchen staff may read nothing here; a server may not hide; another business cannot touch it.
    await expect(rv.setReviewStatus({ ...owner(), actor: { ...owner().actor, role: "server" as const } }, low.id, "hidden")).rejects.toMatchObject({ code: "forbidden" });
    const foreign = { db, actor: { kind: "member" as const, userId: "it-rev-other", restaurantId: other.id, role: "owner" as const }, restaurantId: other.id };
    await expect(rv.setReviewStatus(foreign, low.id, "hidden")).rejects.toBeInstanceOf(NotFoundError);

    await rv.setReviewStatus(owner(), low.id, "hidden");
    let pub = await rv.publicReviews(db, r.id);
    expect(pub.summary).toMatchObject({ count: 1, average: 5 });
    const mine = await rv.businessReviews(owner());
    expect(mine.counts).toMatchObject({ visible: 1, hidden: 1, deleted: 0 });
    expect(mine.all.average).toBe(3); // the real average still counts hidden reviews

    await rv.setReviewStatus(owner(), low.id, "deleted");
    pub = await rv.publicReviews(db, r.id);
    expect(pub.reviews.map((x) => x.rating)).toEqual([5]);
    const after = await rv.businessReviews(owner());
    expect(after.list.map((x) => x.id)).not.toContain(low.id);
    // Deleted is final for the business…
    await expect(rv.setReviewStatus(owner(), low.id, "visible")).rejects.toBeInstanceOf(NotFoundError);
    // …but the console sees it, with its state and when it changed.
    const platform = await rv.platformReviews(db, { restaurantId: r.id });
    expect(platform.totals).toMatchObject({ total: 2, deleted: 1, low: 1, lowRemoved: 1, average: 3 });
    expect(platform.list.find((x) => x.id === low.id)).toMatchObject({ status: "deleted" });
  });

  it("reviews switched off: no new review is accepted", async () => {
    const db = getDb();
    const off = { ...r, settings: { ...r.settings, features: { ...(r.settings.features ?? {}), reviews: false } } };
    const served = await order(r, PHONE, "served");
    await expect(rv.submitReview(db, off, PHONE, { orderId: served, rating: 4, lang: "fr" })).rejects.toMatchObject({ code: "disabled" });
    expect(rv.reviewsEnabled(off)).toBe(false);
    expect(rv.reviewsEnabled(r)).toBe(true);
  });
});
