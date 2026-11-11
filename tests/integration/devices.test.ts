import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { closeDb, getDb } = await import("@/db");
const { members, restaurants, staffSessions } = await import("@/db/schema");
const { createRestaurantForUser } = await import("@/lib/restaurants/provision");
const dev = await import("@/lib/devices");
const { hashPin } = await import("@/lib/personnel/pin");
const { ForbiddenError } = await import("@/lib/errors");

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("authorised devices and PIN login (database)", () => {
  const ids: string[] = [];
  type R = typeof restaurants.$inferSelect;
  let r: R;
  let other: R;
  let awa: string;
  let ownerId: string;
  let stranger: string;
  const ownerCtx = () => ({ db: getDb(), actor: { kind: "member" as const, userId: "it-dev-owner", restaurantId: r.id, role: "owner" as const }, restaurantId: r.id });

  beforeAll(async () => {
    const db = getDb();
    r = await createRestaurantForUser(db, { clerkUserId: "it-dev-owner" }, { name: "Maquis Tablette", city: "Ouagadougou" });
    other = await createRestaurantForUser(db, { clerkUserId: "it-dev-other" }, { name: "Maquis Voisin Tablette", city: "Ouagadougou" });
    ids.push(r.id, other.id);
    const pin = await hashPin("2468");
    const [a] = await db.insert(members).values({ restaurantId: r.id, name: "Awa", role: "server", staffNo: 2, pinHash: pin }).returning();
    const [s] = await db.insert(members).values({ restaurantId: other.id, name: "Voisin", role: "server", staffNo: 2, pinHash: pin }).returning();
    awa = a!.id;
    stranger = s!.id;
    const [o] = await db.select().from(members).where(eq(members.clerkUserId, "it-dev-owner"));
    ownerId = o!.id;
    await db.update(members).set({ pinHash: pin }).where(eq(members.id, ownerId));
  });
  afterAll(async () => {
    await getDb().delete(restaurants).where(inArray(restaurants.id, ids));
    await closeDb();
  });

  it("only owners/managers authorise devices; the cookie secret is never stored", async () => {
    const serverCtx = { ...ownerCtx(), actor: { ...ownerCtx().actor, role: "server" as const } };
    await expect(dev.authorizeDevice(serverCtx, "Tablette", null)).rejects.toBeInstanceOf(ForbiddenError);
    const { device, token } = await dev.authorizeDevice(ownerCtx(), "Tablette salle", ownerId);
    expect(device.tokenHash).not.toBe(token);
    expect((await dev.deviceFromToken(getDb(), token))?.device.id).toBe(device.id);
    expect(await dev.deviceFromToken(getDb(), "x".repeat(40))).toBeNull();
  });

  it("PIN login: wrong PIN counts, right PIN opens a session; owner and other businesses' people can't", async () => {
    const db = getDb();
    const { device } = await dev.authorizeDevice(ownerCtx(), "Tablette caisse", ownerId);
    expect(await dev.pinLogin(db, device, r, awa, "0000")).toMatchObject({ ok: false, error: "wrong_pin", triesLeft: 4 });
    expect(await dev.pinLogin(db, device, r, ownerId, "2468")).toMatchObject({ ok: false, error: "unknown" });
    expect(await dev.pinLogin(db, device, r, stranger, "2468")).toMatchObject({ ok: false, error: "unknown" });
    const ok = await dev.pinLogin(db, device, r, awa, "2468");
    expect(ok.ok).toBe(true);
    const s = await dev.sessionFromToken(db, ok.ok ? ok.token : "");
    expect(s?.member.id).toBe(awa);
    expect(s?.restaurant.id).toBe(r.id);
    // The team shown on the pad: never the owner.
    expect((await dev.deviceTeam(db, r.id)).map((p) => p.id)).toEqual([awa]);
  });

  it("sessions end: idle too long, end of shift, « Verrouiller », revoked device", async () => {
    const db = getDb();
    const { device } = await dev.authorizeDevice(ownerCtx(), "Tablette cuisine", ownerId);
    const login = async () => {
      const res = await dev.pinLogin(db, device, r, awa, "2468");
      if (!res.ok) throw new Error("login failed");
      return res.token;
    };
    // Idle: 16 minutes later (default lock after 15).
    const t1 = await login();
    expect(await dev.sessionFromToken(db, t1, new Date(Date.now() + 16 * 60_000))).toBeNull();
    expect(await dev.sessionFromToken(db, t1)).toBeNull();
    // End of shift.
    const t2 = await login();
    await db.update(staffSessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(staffSessions.deviceId, device.id));
    expect(await dev.sessionFromToken(db, t2)).toBeNull();
    // Lock.
    const t3 = await login();
    await dev.endSession(db, t3);
    expect(await dev.sessionFromToken(db, t3)).toBeNull();
    // A new login on the same device logs the previous person out.
    const t4 = await login();
    const t5 = await login();
    expect(await dev.sessionFromToken(db, t4)).toBeNull();
    expect(await dev.sessionFromToken(db, t5)).not.toBeNull();
    // Revoke: device and session stop at once.
    await dev.revokeDevice(ownerCtx(), device.id);
    expect(await dev.sessionFromToken(db, t5)).toBeNull();
  });

  it("five wrong PINs lock the person (shared with check-in)", async () => {
    const db = getDb();
    const { device } = await dev.authorizeDevice(ownerCtx(), "Tablette bar", ownerId);
    for (let i = 0; i < 4; i++) await dev.pinLogin(db, device, r, awa, "1111");
    expect(await dev.pinLogin(db, device, r, awa, "1111")).toMatchObject({ ok: false, error: "locked" });
    expect(await dev.pinLogin(db, device, r, awa, "2468")).toMatchObject({ ok: false, error: "locked" });
  });
});
