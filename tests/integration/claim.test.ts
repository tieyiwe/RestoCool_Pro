import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { closeDb, getDb } = await import("@/db");
const { jobRoles, members, restaurants } = await import("@/db/schema");
const { claimBusinessesByEmail } = await import("@/lib/restaurants/claim");

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("handing a prepared business to its owner (database)", () => {
  const ids: string[] = [];
  afterAll(async () => {
    await getDb().delete(restaurants).where(inArray(restaurants.id, ids));
    await closeDb();
  });

  it("only the matching verified email becomes owner, once; the email is then removed", async () => {
    const db = getDb();
    const [r] = await db
      .insert(restaurants)
      .values({ slug: `prepared-${Date.now()}`, name: "Prêt pour vous", plan: "pro", planStatus: "trial", settings: { ownerEmail: "patron@example.com" } })
      .returning();
    ids.push(r!.id);
    expect(await claimBusinessesByEmail(db, { clerkUserId: "it-claim-other", verifiedEmail: "someone@example.com" })).toEqual([]);
    expect(await claimBusinessesByEmail(db, { clerkUserId: "it-claim-owner", verifiedEmail: "Patron@Example.com", name: "Le Patron" })).toEqual([r!.id]);
    const owners = await db.select().from(members).where(and(eq(members.restaurantId, r!.id), eq(members.role, "owner")));
    expect(owners).toHaveLength(1);
    expect(owners[0]).toMatchObject({ clerkUserId: "it-claim-owner", staffNo: 1, name: "Le Patron" });
    const fresh = await db.query.restaurants.findFirst({ where: eq(restaurants.id, r!.id) });
    expect(fresh!.settings.ownerEmail).toBeUndefined();
    expect((await db.select().from(jobRoles).where(eq(jobRoles.restaurantId, r!.id))).length).toBeGreaterThan(0);
    // A second sign-in claims nothing more.
    expect(await claimBusinessesByEmail(db, { clerkUserId: "it-claim-owner", verifiedEmail: "patron@example.com" })).toEqual([]);
  });
});
