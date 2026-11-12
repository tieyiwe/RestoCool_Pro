import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db";
import { adminNotes, planEvents, platformSettings, restaurants } from "@/db/schema";
import { NotFoundError } from "@/lib/errors";

vi.mock("server-only", () => ({}));
// Nobody is super admin in this test.
vi.mock("@/lib/auth/context", () => ({ requireSuperadmin: vi.fn(async () => { throw new NotFoundError(); }) }));
const redirects: string[] = [];
vi.mock("next/navigation", () => ({ redirect: (to: string) => { redirects.push(to); throw new Error("NEXT_REDIRECT"); }, notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: () => {}, get: () => undefined }) }));

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("admin actions refuse anyone who is not super admin (database)", () => {
  let id = "";
  beforeEach(() => {
    redirects.length = 0;
  });
  afterAll(async () => {
    await closeDb();
  });

  it("no action changes anything: plan, payment, suspend, publish, featured, note, settings", async () => {
    const a = await import("@/app/admin_pro/actions");
    const [r] = await getDb().select().from(restaurants).where(eq(restaurants.slug, "restaurant-demo"));
    id = r!.id;
    const before = { ...r! };
    const eventsBefore = (await getDb().select().from(planEvents).where(eq(planEvents.restaurantId, id))).length;
    const fd = (o: Record<string, string>) => {
      const f = new FormData();
      for (const [k, v] of Object.entries(o)) f.set(k, v);
      return f;
    };
    const calls: Array<[string, () => Promise<unknown>]> = [
      ["plan", () => a.changePlanAction(fd({ id, plan: "business", status: "active", expiresOn: "2030-01-01" }))],
      ["payment", () => a.recordPaymentAction(fd({ id, plan: "business", months: "12", amount: "1", method: "cash" }))],
      ["suspend", () => a.suspendAction(fd({ id, on: "1", reason: "x" }))],
      ["publish", () => a.publishAction(fd({ id, on: "0" }))],
      ["featured", () => a.featuredAction(fd({ id, rank: "1" }))],
      ["note", () => a.noteAction(fd({ id, body: "hack" }))],
      ["freeLaunch", () => a.freeLaunchAction(fd({ on: "0" }))],
      ["announcement", () => a.announcementAction(fd({ fr: "hack", active: "on", level: "info" }))],
      ["errors", () => a.resolveErrorAction(fd({ id: "all" }))],
    ];
    for (const [name, call] of calls) {
      await expect(call(), name).rejects.toThrow();
    }
    const [after] = await getDb().select().from(restaurants).where(eq(restaurants.id, id));
    expect({ plan: after!.plan, status: after!.planStatus, published: after!.published, featured: after!.featuredRank, expires: after!.planExpiresAt?.getTime() }).toEqual({
      plan: before.plan,
      status: before.planStatus,
      published: before.published,
      featured: before.featuredRank,
      expires: before.planExpiresAt?.getTime(),
    });
    expect((await getDb().select().from(planEvents).where(eq(planEvents.restaurantId, id))).length).toBe(eventsBefore);
    expect(await getDb().select().from(adminNotes).where(eq(adminNotes.body, "hack"))).toHaveLength(0);
    expect(await getDb().select().from(platformSettings)).toHaveLength(0);
    // Every refused action lands on a « not found » page, never on a success message.
    expect(redirects.every((u) => !u.includes("ok="))).toBe(true);
  });
});
