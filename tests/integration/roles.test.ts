import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { roleId } = await import("./helpers/roles");
const { closeDb, getDb } = await import("@/db");
const { tenantRepo } = await import("@/db/repos/tenant");
const { members, restaurants } = await import("@/db/schema");
const { createRestaurantForUser } = await import("@/lib/restaurants/provision");
const { membershipsForUser } = await import("@/db/repos/tenant");
const roles = await import("@/lib/personnel/roles");
const { addPerson } = await import("@/lib/personnel/attendance");
const { ForbiddenError } = await import("@/lib/errors");

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("job roles (database)", () => {
  const OWNER = "it-roles-owner";
  const MGR = "it-roles-mgr";
  const COOK = "it-roles-cook";
  let rid: string;
  const ctx = (userId: string, role: "owner" | "manager") => ({ db: getDb(), actor: { kind: "member" as const, userId, restaurantId: rid, role }, repo: tenantRepo(getDb(), rid) });

  beforeAll(async () => {
    const r = await createRestaurantForUser(getDb(), { clerkUserId: OWNER }, { name: "Maquis Rôles", city: "Koudougou" });
    rid = r.id;
    await getDb().insert(members).values([
      { restaurantId: rid, clerkUserId: MGR, role: "manager", staffNo: 2 },
      { restaurantId: rid, clerkUserId: COOK, role: "kitchen", staffNo: 3 },
    ]);
  });
  afterAll(async () => {
    await getDb().delete(restaurants).where(inArray(restaurants.id, [rid]));
    await closeDb();
  });

  it("a new restaurant gets the ready-made roles; existing personnel are moved onto them", async () => {
    const list = await roles.listJobRoles(getDb(), rid);
    expect(list.length).toBeGreaterThanOrEqual(13);
    const cook = await getDb().query.members.findFirst({ where: and(eq(members.restaurantId, rid), eq(members.clerkUserId, COOK)) });
    expect(cook?.jobRoleId).toBe(await roleId(rid, "cook"));
  });

  it("the owner edits a role's access and the holders get it at their next request", async () => {
    await roles.updateJobRoleAccess(ctx(OWNER, "owner"), await roleId(rid, "cook"), ["kitchen", "menu"]);
    const m = (await membershipsForUser(getDb(), COOK)).find((x) => x.restaurantId === rid)!;
    expect(m.access).toEqual(["kitchen", "menu"]);
    await expect(roles.updateJobRoleAccess(ctx(MGR, "manager"), await roleId(rid, "cook"), ["staff"])).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("custom roles typed by the owner; names are unique; a used role can't be deleted", async () => {
    const custom = await roles.createJobRole(ctx(OWNER, "owner"), { name: "Chef grillades", group: "kitchen", access: ["kitchen", "soldOut"] });
    await expect(roles.createJobRole(ctx(OWNER, "owner"), { name: "chef GRILLADES", group: "kitchen", access: [] })).rejects.toBeInstanceOf(roles.RoleError);
    const p = await addPerson(ctx(MGR, "manager"), { name: "Moussa", jobRoleId: custom.id, pin: "2468" });
    await expect(roles.deleteJobRole(ctx(OWNER, "owner"), custom.id)).rejects.toBeInstanceOf(roles.RoleError);
    await roles.assignJobRole(ctx(MGR, "manager"), p.id, await roleId(rid, "dishwasher"));
    await roles.deleteJobRole(ctx(OWNER, "owner"), custom.id);
  });

  it("only the owner gives a role that manages the personnel", async () => {
    const p = await addPerson(ctx(MGR, "manager"), { name: "Salif", jobRoleId: await roleId(rid, "server"), pin: "1357" });
    await expect(roles.assignJobRole(ctx(MGR, "manager"), p.id, await roleId(rid, "manager"))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(addPerson(ctx(MGR, "manager"), { name: "Ali", jobRoleId: await roleId(rid, "manager"), pin: "1357" })).rejects.toBeInstanceOf(ForbiddenError);
    await roles.assignJobRole(ctx(OWNER, "owner"), p.id, await roleId(rid, "manager"));
    const row = await getDb().query.members.findFirst({ where: eq(members.id, p.id) });
    expect(row?.role).toBe("manager");
    // Now a lead: the manager can no longer change their role.
    await expect(roles.assignJobRole(ctx(MGR, "manager"), p.id, await roleId(rid, "server"))).rejects.toBeInstanceOf(ForbiddenError);
  });
});
