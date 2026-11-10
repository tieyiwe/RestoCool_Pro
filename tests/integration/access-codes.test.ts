import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { closeDb, getDb } = await import("@/db");
const { tenantRepo } = await import("@/db/repos/tenant");
const { accessCodes, restaurants, seats } = await import("@/db/schema");
const codes = await import("@/lib/access-codes");
const admin = await import("@/lib/seating/admin");
const settings = await import("@/lib/restaurants/settings");
const { createRestaurantForUser } = await import("@/lib/restaurants/provision");

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("access codes and new-restaurant setup (database)", () => {
  const ids: string[] = [];
  type R = typeof restaurants.$inferSelect;
  let r: R;
  let ctx: Parameters<typeof admin.addTables>[0];

  beforeAll(async () => {
    r = await createRestaurantForUser(getDb(), { clerkUserId: "it-code-a" }, { name: "Maquis Code", city: "Bobo-Dioulasso" });
    ids.push(r.id);
    ctx = { db: getDb(), actor: { kind: "member", userId: "it-code-a", restaurantId: r.id, role: "owner" }, repo: tenantRepo(getDb(), r.id) };
  });
  afterAll(async () => {
    await getDb().delete(restaurants).where(inArray(restaurants.id, ids));
    await closeDb();
  });

  it("a new restaurant has its main code from the start, and it opens the menu", async () => {
    const row = await getDb().query.accessCodes.findFirst({ where: eq(accessCodes.restaurantId, r.id) });
    expect(row?.seatId).toBeNull();
    expect(await codes.ensureMainCode(getDb(), r.id)).toBe(row!.code);
    expect(await codes.resolveCode(getDb(), row!.code.toLowerCase())).toEqual({ slug: r.slug, seatToken: null });
    expect(await codes.resolveCode(getDb(), "ZZZZZ")).toBeNull();
  });

  it("the setup wizard creates tables 1..N once, only in table mode", async () => {
    const base = { qrStrategy: "per_seat" as const, orderValidation: "direct" as const, enabledLocales: ["fr" as const] };
    await settings.saveService(ctx, { ...base, seatingModes: ["takeaway"], tableCount: 5 });
    expect((await ctx.repo.seating.seats()).filter((s) => s.type === "table")).toHaveLength(0);
    await settings.saveService(ctx, { ...base, seatingModes: ["table", "takeaway"], tableCount: 4 });
    expect((await ctx.repo.seating.seats()).filter((s) => s.type === "table").map((s) => s.label)).toEqual(["1", "2", "3", "4"]);
    // Going back through the wizard doesn't add more.
    await settings.saveService(ctx, { ...base, seatingModes: ["table"], tableCount: 9 });
    expect((await ctx.repo.seating.seats()).filter((s) => s.type === "table")).toHaveLength(4);
  });

  it("seat codes open the seat, change with the QR, and fall back to the menu when the seat is off", async () => {
    const table = (await ctx.repo.seating.seats()).find((s) => s.type === "table")!;
    const first = (await codes.ensureSeatCodes(getDb(), r.id, [table.id])).get(table.id)!;
    expect((await codes.ensureSeatCodes(getDb(), r.id, [table.id])).get(table.id)).toBe(first);
    expect(await codes.resolveCode(getDb(), first)).toEqual({ slug: r.slug, seatToken: table.qrToken });

    await admin.regenerateToken(ctx, table.id);
    expect(await codes.resolveCode(getDb(), first)).toBeNull();
    const second = (await codes.ensureSeatCodes(getDb(), r.id, [table.id])).get(table.id)!;
    expect(second).not.toBe(first);

    await getDb().update(seats).set({ active: false }).where(eq(seats.id, table.id));
    expect(await codes.resolveCode(getDb(), second)).toEqual({ slug: r.slug, seatToken: null });
  });
});
