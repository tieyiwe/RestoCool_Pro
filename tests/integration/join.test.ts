import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { roleId } = await import("./helpers/roles");
const { closeDb, getDb } = await import("@/db");
const { tenantRepo } = await import("@/db/repos/tenant");
const { members, restaurants } = await import("@/db/schema");
const { createRestaurantForUser } = await import("@/lib/restaurants/provision");
const join = await import("@/lib/personnel/join");
const { verifyPin } = await import("@/lib/personnel/pin");
const { ForbiddenError, NotFoundError } = await import("@/lib/errors");

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("joining the team with the team QR (database)", () => {
  const ids: string[] = [];
  type R = typeof restaurants.$inferSelect;
  let r: R;
  let other: R;
  const ctx = (rest: R, userId: string, role: "owner" | "manager" | "server") => ({ db: getDb(), actor: { kind: "member" as const, userId, restaurantId: rest.id, role }, repo: tenantRepo(getDb(), rest.id) });

  beforeAll(async () => {
    r = await createRestaurantForUser(getDb(), { clerkUserId: "it-join-owner" }, { name: "Maquis Équipe", city: "Ouagadougou" });
    other = await createRestaurantForUser(getDb(), { clerkUserId: "it-join-other" }, { name: "Boutique Voisine", city: "Bobo-Dioulasso" });
    ids.push(r.id, other.id);
  });
  afterAll(async () => {
    await getDb().delete(restaurants).where(inArray(restaurants.id, ids));
    await closeDb();
  });

  it("scan → request → owner accepts with a role → member with the next matricule and the chosen PIN", async () => {
    const db = getDb();
    const token = await join.ensureJoinToken(db, r);
    expect(await join.ensureJoinToken(db, (await db.query.restaurants.findFirst({ where: eq(restaurants.id, r.id) }))!)).toBe(token);
    const biz = (await join.restaurantByJoinToken(db, token))!;
    expect(biz.id).toBe(r.id);

    const req = await join.submitJoinRequest(db, biz, { name: "Awa Ouédraogo", phone: "70 11 22 33", pin: "4826" });
    // Same phone again replaces the waiting request (no duplicates for the owner).
    const req2 = await join.submitJoinRequest(db, biz, { name: "Awa Ouédraogo", phone: "+226 70 11 22 33", pin: "4826" });
    expect(await join.pendingJoinCount(db, r.id)).toBe(1);
    expect(await join.joinRequestStatus(db, req.id, req.secret)).toBeNull();
    expect(await join.joinRequestStatus(db, req2.id, "wrong-secret")).toBeNull();
    expect((await join.joinRequestStatus(db, req2.id, req2.secret))?.status).toBe("pending");

    // Another business can't touch it; a server (no personnel access) can't accept.
    await expect(join.acceptJoinRequest(ctx(other, "it-join-other", "owner"), req2.id, await roleId(other.id, "server"))).rejects.toBeInstanceOf(NotFoundError);
    await expect(join.acceptJoinRequest(ctx(r, "x", "server"), req2.id, await roleId(r.id, "server"))).rejects.toBeInstanceOf(ForbiddenError);
    // A manager can't give a role that manages the personnel.
    await expect(join.acceptJoinRequest(ctx(r, "x", "manager"), req2.id, await roleId(r.id, "manager"))).rejects.toBeInstanceOf(ForbiddenError);

    const done = await join.acceptJoinRequest(ctx(r, "it-join-owner", "owner"), req2.id, await roleId(r.id, "cook"));
    expect(done.staffNo).toBe(2);
    const m = await db.query.members.findFirst({ where: eq(members.id, done.memberId) });
    expect(m).toMatchObject({ name: "Awa Ouédraogo", phone: "22670112233", staffNo: 2, role: "kitchen", clerkUserId: null, active: true });
    expect(await verifyPin("4826", m!.pinHash!)).toBe(true);
    expect(await join.joinRequestStatus(db, req2.id, req2.secret)).toMatchObject({ status: "accepted", staffNo: 2 });
    // Accepting twice does nothing more.
    await expect(join.acceptJoinRequest(ctx(r, "it-join-owner", "owner"), req2.id, await roleId(r.id, "cook"))).rejects.toBeInstanceOf(NotFoundError);
    // Already in the team: a new request with the same phone is refused.
    await expect(join.submitJoinRequest(db, biz, { name: "Awa O.", phone: "70112233", pin: "1111" })).rejects.toMatchObject({ code: "closed" });
  });

  it("decline, bad phones, regenerated QR", async () => {
    const db = getDb();
    const biz = (await db.query.restaurants.findFirst({ where: eq(restaurants.id, r.id) }))!;
    await expect(join.submitJoinRequest(db, biz, { name: "Issa", phone: "123", pin: "1234" })).rejects.toMatchObject({ code: "phone" });
    expect(join.normalizeJoinPhone("+225 07 07 07 07 07")).toBe("2250707070707");
    expect(join.normalizeJoinPhone("0707070707")).toBeNull();
    const req = await join.submitJoinRequest(db, biz, { name: "Issa Kaboré", phone: "76 00 00 01", pin: "1234" });
    await join.declineJoinRequest(ctx(r, "it-join-owner", "owner"), req.id);
    expect((await join.joinRequestStatus(db, req.id, req.secret))?.status).toBe("declined");
    const old = biz.settings.joinToken!;
    await join.regenerateJoinToken(ctx(r, "it-join-owner", "owner"));
    expect(await join.restaurantByJoinToken(db, old)).toBeNull();
  });
});
