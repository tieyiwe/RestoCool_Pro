import { and, eq, inArray, isNull } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db";
import { accessCodes, appErrors, planEvents, platformSettings, restaurants } from "@/db/schema";
import { listBusinesses, BusinessFilter } from "@/lib/admin/businesses";
import { addNote, changePlan, recordPlanPayment, setFeatured, setSuspended, type AdminCtx } from "@/lib/admin/manage";
import { platformOverview } from "@/lib/admin/metrics";
import { effectiveStatus, hasFeature } from "@/lib/plan";
import { recordError } from "@/lib/platform/errors";
import { freeLaunchActive } from "@/lib/platform/flags";
import { getPlatformSettings, savePlatformSetting, clearPlatformSetting } from "@/lib/platform/settings";
import { createRestaurantForUser } from "@/lib/restaurants/provision";

vi.mock("server-only", () => ({}));
const hasDb = Boolean(process.env.DATABASE_URL);
const sa = { kind: "superadmin" as const, userId: "sa_test", email: "admin@example.com" };

describe.skipIf(!hasDb)("super admin console (database)", () => {
  const created: string[] = [];
  const ctx = (): AdminCtx => ({ db: getDb(), actor: sa });
  const fresh = async (id: string) => (await getDb().query.restaurants.findFirst({ where: eq(restaurants.id, id) }))!;

  afterAll(async () => {
    if (created.length) await getDb().delete(restaurants).where(inArray(restaurants.id, created));
    await clearPlatformSetting(getDb(), "freeLaunch");
    await closeDb();
  });

  it("a plan payment activates the plan and moves its end forward; history keeps amount and method", async () => {
    const r = await createRestaurantForUser(getDb(), { clerkUserId: "sa_owner_1" }, { name: `Admin Test ${Date.now()}`, city: "Koudougou" });
    created.push(r.id);
    const now = new Date("2026-11-12T10:00:00Z");
    const until = await recordPlanPayment(ctx(), r.id, { plan: "pro", months: 2, amount: 20000, method: "orange_money", reference: "OM123" }, now);
    expect(until.toISOString().slice(0, 10)).toBe("2027-01-11");
    const after = await fresh(r.id);
    expect(after).toMatchObject({ plan: "pro", planStatus: "active" });
    // Paying again while active extends from the current end, not from today.
    const until2 = await recordPlanPayment(ctx(), r.id, { plan: "business", months: 1, amount: 25000, method: "cash" }, now);
    expect(until2.toISOString().slice(0, 10)).toBe("2027-02-10");
    const ev = await getDb().select().from(planEvents).where(eq(planEvents.restaurantId, r.id));
    expect(ev.filter((e) => e.amount).map((e) => [e.amount, e.method])).toEqual(expect.arrayContaining([[20000, "orange_money"], [25000, "cash"]]));
    expect(ev.every((e) => e.automatic || e.bySuperadmin === sa.email)).toBe(true);
  });

  it("suspending stops ordering but keeps the menu; reactivating restores it; manual plan changes are logged", async () => {
    const id = created[0]!;
    await setSuspended(ctx(), id, true, "Paiement en attente");
    let r = await fresh(id);
    expect(r.planStatus).toBe("suspended");
    expect(r.settings.suspendedReason).toBe("Paiement en attente");
    expect(hasFeature(r, "ordering")).toBe(false);
    expect(hasFeature(r, "menu")).toBe(true);
    await setSuspended(ctx(), id, false);
    r = await fresh(id);
    expect(r.planStatus).toBe("active");
    expect(hasFeature(r, "ordering")).toBe(true);
    await changePlan(ctx(), id, { plan: "gratuit", status: "active", expiresOn: "" });
    r = await fresh(id);
    expect(r).toMatchObject({ plan: "gratuit", planStatus: "active", planExpiresAt: null });
    // A free business that is suspended then reactivated is simply active again (never a « trial »).
    await setSuspended(ctx(), id, true, "x");
    await setSuspended(ctx(), id, false);
    expect((await fresh(id)).planStatus).toBe("active");
    await addNote(ctx(), id, "Appelé le propriétaire : paiement vendredi.");
  });

  it("« À la une »: taking a rank moves the others down, never more than 3", async () => {
    const ids: string[] = [];
    for (const i of [1, 2, 3]) {
      const r = await createRestaurantForUser(getDb(), { clerkUserId: `sa_owner_f${i}` }, { name: `Admin Featured ${i} ${Date.now()}`, city: "Ouagadougou" });
      created.push(r.id);
      ids.push(r.id);
    }
    // Clear existing featured ranks for a clean test, remembering them.
    const before = await getDb().select({ id: restaurants.id, rank: restaurants.featuredRank }).from(restaurants);
    await getDb().update(restaurants).set({ featuredRank: null });
    try {
      await setFeatured(ctx(), ids[0]!, 1);
      await setFeatured(ctx(), ids[1]!, 1);
      await setFeatured(ctx(), ids[2]!, 2);
      const ranks = Object.fromEntries((await Promise.all(ids.map(fresh))).map((r) => [r.id, r.featuredRank]));
      expect(ranks[ids[1]!]).toBe(1);
      expect(ranks[ids[2]!]).toBe(2);
      expect(ranks[ids[0]!]).toBe(3);
      await setFeatured(ctx(), ids[0]!, null);
      expect((await fresh(ids[0]!)).featuredRank).toBeNull();
    } finally {
      for (const b of before) if (b.rank) await getDb().update(restaurants).set({ featuredRank: b.rank }).where(eq(restaurants.id, b.id));
    }
  });

  it("the business list finds a business by its numéro RC and by town; the overview adds up", async () => {
    const id = created[0]!;
    const [code] = await getDb().select({ code: accessCodes.code }).from(accessCodes).where(and(eq(accessCodes.restaurantId, id), isNull(accessCodes.seatId)));
    const byRc = await listBusinesses(getDb(), BusinessFilter.parse({ q: `rc-${code!.code.toLowerCase()}` }));
    expect(byRc.map((b) => b.id)).toEqual([id]);
    const byTown = await listBusinesses(getDb(), BusinessFilter.parse({ q: "Koudougou" }));
    expect(byTown.some((b) => b.id === id)).toBe(true);
    const o = await platformOverview(getDb());
    expect(o.businesses.total).toBeGreaterThanOrEqual(4);
    expect(o.funnel.created).toBe(o.businesses.total);
    expect(o.plans.paid30).toBeGreaterThanOrEqual(45000);
  });

  it("errors are grouped by message (ids and numbers ignored) and counted", async () => {
    await getDb().delete(appErrors).where(eq(appErrors.where, "/test/admin"));
    await recordError("Order 3f2b7c1e-1d2a-4b5c-8d9e-0a1b2c3d4e5f failed after 12 ms", "/test/admin");
    await new Promise((r) => setTimeout(r, 10));
    const [row] = await getDb().select().from(appErrors).where(eq(appErrors.where, "/test/admin"));
    expect(row?.count).toBe(1);
    await getDb().delete(appErrors).where(eq(appErrors.where, "/test/admin"));
  });

  it("the launch offer switch changes how an expired trial counts, without a deploy", async () => {
    const trial = { plan: "pro" as const, planStatus: "trial" as const, planExpiresAt: new Date("2020-01-01") };
    await savePlatformSetting(getDb(), "freeLaunch", false, sa.email);
    expect(freeLaunchActive()).toBe(false);
    expect(effectiveStatus(trial)).toBe("past_due");
    await savePlatformSetting(getDb(), "freeLaunch", true, sa.email);
    expect((await getPlatformSettings()).freeLaunch).toBe(true);
    expect(effectiveStatus(trial)).toBe("trial");
    expect(await getDb().select().from(platformSettings).where(eq(platformSettings.key, "freeLaunch"))).toHaveLength(1);
  });
});
