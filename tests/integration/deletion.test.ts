import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { closeDb, getDb } from "@/db";
import { deletionRequests, restaurants } from "@/db/schema";
import { processDeletions } from "@/lib/restaurants/deletion";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("business deletion timing (database)", () => {
  afterAll(async () => {
    await getDb().delete(restaurants).where(eq(restaurants.slug, "deletion-timing-test"));
    await closeDb();
  });

  it("nothing happens before the team confirms, nor before the 72 h; deleted = offline and restorable; purged after 10 days", async () => {
    const db = getDb();
    await db.delete(restaurants).where(eq(restaurants.slug, "deletion-timing-test"));
    const [r] = await db.insert(restaurants).values({ slug: "deletion-timing-test", name: "Timing", published: true }).returning();
    const [req] = await db
      .insert(deletionRequests)
      .values({ restaurantId: r!.id, businessName: "Timing", requestedBy: "u", reason: "x", effectiveAt: new Date(Date.now() - 60_000), wasPublished: true })
      .returning();
    // Pending (not confirmed by the team): nothing, even after the 72 h.
    await processDeletions(db);
    expect((await db.select().from(restaurants).where(eq(restaurants.id, r!.id)))[0]!.deletedAt).toBeNull();
    // Confirmed but not yet 72 h: nothing.
    await db.update(deletionRequests).set({ status: "confirmed", effectiveAt: new Date(Date.now() + 3600_000) }).where(eq(deletionRequests.id, req!.id));
    await processDeletions(db);
    expect((await db.select().from(restaurants).where(eq(restaurants.id, r!.id)))[0]!.deletedAt).toBeNull();
    // Confirmed and due: deleted (offline, data kept), restorable 10 days.
    const now = new Date();
    await db.update(deletionRequests).set({ effectiveAt: new Date(now.getTime() - 1000) }).where(eq(deletionRequests.id, req!.id));
    await processDeletions(db, now);
    const [gone] = await db.select().from(restaurants).where(eq(restaurants.id, r!.id));
    expect(gone!.deletedAt).not.toBeNull();
    expect(gone!.published).toBe(false);
    const [d] = await db.select().from(deletionRequests).where(eq(deletionRequests.id, req!.id));
    expect(d!.status).toBe("deleted");
    expect(Math.round((d!.restoreUntil!.getTime() - now.getTime()) / 86_400_000)).toBe(10);
    // Day 9: still there. Day 11: removed for good, the request kept as a record.
    await processDeletions(db, new Date(now.getTime() + 9 * 86_400_000));
    expect(await db.select().from(restaurants).where(eq(restaurants.id, r!.id))).toHaveLength(1);
    await processDeletions(db, new Date(now.getTime() + 11 * 86_400_000));
    expect(await db.select().from(restaurants).where(eq(restaurants.id, r!.id))).toHaveLength(0);
    const [p] = await db.select().from(deletionRequests).where(eq(deletionRequests.id, req!.id));
    expect(p!.status).toBe("purged");
    await db.delete(deletionRequests).where(eq(deletionRequests.id, req!.id));
  });
});
