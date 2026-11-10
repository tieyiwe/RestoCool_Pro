import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { closeDb, getDb } = await import("@/db");
const { tenantRepo } = await import("@/db/repos/tenant");
const { auditLog, members, restaurants } = await import("@/db/schema");
const att = await import("@/lib/personnel/attendance");
const { createRestaurantForUser } = await import("@/lib/restaurants/provision");
const { ForbiddenError } = await import("@/lib/errors");

const hasDb = Boolean(process.env.DATABASE_URL);
const OWNER = "it-att-owner";
const MANAGER = "it-att-manager";
const MANAGER2 = "it-att-manager2";

describe.skipIf(!hasDb)("check-in PIN and personnel rights (database)", () => {
  type R = typeof restaurants.$inferSelect;
  let r: R;
  let ownerId: string;
  let managerId: string;
  let manager2Id: string;
  let serverId: string;
  let serverNo: number;
  const ctxAs = (userId: string, role: "owner" | "manager") => ({ db: getDb(), actor: { kind: "member" as const, userId, restaurantId: r.id, role }, repo: tenantRepo(getDb(), r.id) });

  beforeAll(async () => {
    r = await createRestaurantForUser(getDb(), { clerkUserId: OWNER }, { name: "Maquis Pointage", city: "Ouagadougou" });
    const [owner] = await getDb().select().from(members).where(eq(members.restaurantId, r.id));
    ownerId = owner!.id;
    const rows = await getDb()
      .insert(members)
      .values([
        { restaurantId: r.id, clerkUserId: MANAGER, role: "manager", staffNo: 50, name: "Gérant" },
        { restaurantId: r.id, clerkUserId: MANAGER2, role: "manager", staffNo: 51, name: "Gérante" },
      ])
      .returning();
    managerId = rows[0]!.id;
    manager2Id = rows[1]!.id;
    const added = await att.addPerson(ctxAs(OWNER, "owner"), { name: "Awa", role: "server", pin: "4321" });
    serverId = added.id;
    serverNo = added.staffNo;
  });
  afterAll(async () => {
    await getDb().delete(restaurants).where(inArray(restaurants.id, [r.id]));
    await closeDb();
  });

  it("parallel wrong PINs get at most 5 tries, then the profile is locked (even for the right PIN)", async () => {
    const tries = await Promise.all(Array.from({ length: 20 }, (_, i) => att.punch(getDb(), r, serverNo, String(1000 + i), "code")));
    // Every PIN really compared is audited: no more than the allowed number of guesses.
    const guesses = await getDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, serverId), inArray(auditLog.action, ["attendance.pin.wrong", "attendance.pin.locked"])));
    expect(guesses.length).toBeLessThanOrEqual(att.MAX_PIN_FAILURES);
    expect(tries.filter((t) => !t.ok && t.error === "wrong_pin").length).toBeLessThanOrEqual(att.MAX_PIN_FAILURES - 1);
    expect(tries.every((t) => !t.ok)).toBe(true);
    const right = await att.punch(getDb(), r, serverNo, "4321", "code");
    expect(right).toMatchObject({ ok: false, error: "locked" });
  });

  it("the lock ends after 10 minutes; a right PIN clears the count", async () => {
    const later = new Date(Date.now() + (att.LOCK_MINUTES + 1) * 60_000);
    expect(await att.punch(getDb(), r, serverNo, "0000", "code", later)).toMatchObject({ ok: false, error: "wrong_pin", triesLeft: att.MAX_PIN_FAILURES - 1 });
    expect(await att.punch(getDb(), r, serverNo, "4321", "code", later)).toMatchObject({ ok: true, action: "in" });
    const m = await getDb().query.members.findFirst({ where: eq(members.id, serverId) });
    expect(m).toMatchObject({ pinFailures: 0, lockedUntil: null });
  });

  it("sequential wrong PINs lock on the 5th", async () => {
    const at = new Date(Date.now() + 60 * 60_000);
    for (let i = 1; i < att.MAX_PIN_FAILURES; i++) expect(await att.punch(getDb(), r, serverNo, "0000", "code", at)).toMatchObject({ error: "wrong_pin", triesLeft: att.MAX_PIN_FAILURES - i });
    expect(await att.punch(getDb(), r, serverNo, "0000", "code", at)).toMatchObject({ error: "locked", minutesLeft: att.LOCK_MINUTES });
    expect(await att.punch(getDb(), r, serverNo, "4321", "code", at)).toMatchObject({ error: "locked" });
  });

  it("a manager manages the personnel, but not another manager or the owner", async () => {
    const mgr = ctxAs(MANAGER, "manager");
    await expect(att.setPin(mgr, serverId, "5555")).resolves.toBeUndefined();
    await expect(att.setActive(mgr, serverId, false)).resolves.toBeUndefined();
    await att.setActive(mgr, serverId, true);
    await expect(att.setPin(mgr, ownerId, "1234")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(att.setPin(mgr, manager2Id, "1234")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(att.setActive(mgr, manager2Id, false)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await getDb().query.members.findFirst({ where: eq(members.id, manager2Id) }))?.active).toBe(true);
    // Their own PIN is fine.
    await expect(att.setPin(mgr, managerId, "2468")).resolves.toBeUndefined();
  });

  it("the owner can change a manager's PIN and status", async () => {
    const owner = ctxAs(OWNER, "owner");
    await expect(att.setPin(owner, manager2Id, "1357")).resolves.toBeUndefined();
    await expect(att.setActive(owner, manager2Id, false)).resolves.toBeUndefined();
    await expect(att.setActive(owner, ownerId, false)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
