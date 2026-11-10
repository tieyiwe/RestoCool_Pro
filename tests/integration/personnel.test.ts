import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db";
import { tenantRepo } from "@/db/repos/tenant";
import { members, restaurants } from "@/db/schema";
import type { Actor } from "@/lib/auth/can";
import { ForbiddenError } from "@/lib/errors";
import { addPerson, setActive, setPin } from "@/lib/personnel/attendance";
import { createRestaurantForUser } from "@/lib/restaurants/provision";

vi.mock("server-only", () => ({}));

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("personnel: who may change whom", () => {
  const created: string[] = [];
  afterAll(async () => {
    if (created.length) await getDb().delete(restaurants).where(inArray(restaurants.id, created));
    await closeDb();
  });

  it("a manager manages servers, but not other managers or the owner (owner only)", async () => {
    const db = getDb();
    const r = await createRestaurantForUser(db, { clerkUserId: "user_test_personnel_owner" }, { name: `Maquis Personnel ${Date.now()}`, city: "Ouagadougou" });
    created.push(r.id);
    const repo = tenantRepo(db, r.id);
    const owner: Actor = { kind: "member", userId: "user_test_personnel_owner", restaurantId: r.id, role: "owner" };
    const manager: Actor = { kind: "member", userId: "user_test_personnel_mgr", restaurantId: r.id, role: "manager" };
    const [mgrA] = await db.insert(members).values({ restaurantId: r.id, clerkUserId: "user_test_personnel_mgr", role: "manager", staffNo: 2 }).returning();
    const [mgrB] = await db.insert(members).values({ restaurantId: r.id, clerkUserId: "user_test_personnel_mgr2", role: "manager", staffNo: 3 }).returning();
    const [own] = await db.select().from(members).where(and(eq(members.restaurantId, r.id), eq(members.role, "owner")));
    const server = await addPerson({ db, actor: manager, repo }, { name: "Awa", role: "server", pin: "1234" });

    // Servers: fine for a manager.
    await setPin({ db, actor: manager, repo }, server.id, "4321");
    await setActive({ db, actor: manager, repo }, server.id, false);
    // Another manager or the owner: refused, nothing changes.
    await expect(setActive({ db, actor: manager, repo }, mgrB!.id, false)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setPin({ db, actor: manager, repo }, own!.id, "9999")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setPin({ db, actor: manager, repo }, mgrB!.id, "9999")).rejects.toBeInstanceOf(ForbiddenError);
    const [b] = await db.select().from(members).where(eq(members.id, mgrB!.id));
    expect(b!.active).toBe(true);
    expect(b!.pinHash).toBeNull();
    // The owner can.
    await setActive({ db, actor: owner, repo }, mgrB!.id, false);
    await setPin({ db, actor: owner, repo }, mgrA!.id, "2468");
    const [b2] = await db.select().from(members).where(eq(members.id, mgrB!.id));
    expect(b2!.active).toBe(false);
  });
});
