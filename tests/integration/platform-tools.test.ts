import { and, eq, isNull } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { closeDb, getDb } from "@/db";
import { accessCodes, adminCollaborators, members, restaurants } from "@/db/schema";
import { normalizePerms } from "@/lib/admin/access";
import { addCollaborator, updateCollaborator } from "@/lib/admin/team";
import { businessMatches, roleMatches } from "@/lib/platform/messages";
import { norm, phoneKey, verifyCaller } from "@/lib/admin/recovery";

const hasDb = Boolean(process.env.DATABASE_URL);

describe("message targeting", () => {
  const r = { id: "a", plan: "pro", kind: "restaurant", city: "Bobo-Dioulasso" };
  it("combines every filter; towns ignore case and accents", () => {
    expect(businessMatches({ to: "owners" }, r)).toBe(true);
    expect(businessMatches({ to: "owners", plans: ["gratuit"] }, r)).toBe(false);
    expect(businessMatches({ to: "owners", cities: ["bobo-dioulasso"], kinds: ["restaurant"] }, r)).toBe(true);
    expect(businessMatches({ to: "owners", restaurantIds: ["b"] }, r)).toBe(false);
  });
  it("roles", () => {
    expect(roleMatches("owners", "manager")).toBe(false);
    expect(roleMatches("managers", "manager")).toBe(true);
    expect(roleMatches("everyone", "kitchen")).toBe(true);
  });
  it("recovery helpers", () => {
    expect(norm("  Restaurant Démo ")).toBe("restaurant demo");
    expect(phoneKey("+226 70 00 00 01")).toBe(phoneKey("22670000001"));
  });
});

describe.skipIf(!hasDb)("collaborators and recovery (database)", () => {
  afterAll(async () => {
    await getDb().delete(adminCollaborators).where(eq(adminCollaborators.email, "lead@example.com"));
    await getDb().delete(adminCollaborators).where(eq(adminCollaborators.email, "other@example.com"));
    await closeDb();
  });
  const owner = { kind: "superadmin" as const, userId: "u", email: "boss@example.com", owner: true, perms: new Set<never>() };

  it("a collaborator with « team » can't hand out owner-only rights or more than they have", async () => {
    const db = getDb();
    await addCollaborator({ db, actor: owner }, new Set(), { email: "Lead@Example.com", perms: ["team", "support"] });
    const lead = { kind: "superadmin" as const, userId: "l", email: "lead@example.com", owner: false, perms: new Set(normalizePerms(["team", "support"])) };
    await expect(addCollaborator({ db, actor: lead }, lead.perms, { email: "other@example.com", perms: ["billing.write"] })).rejects.toThrow();
    await expect(addCollaborator({ db, actor: lead }, lead.perms, { email: "other@example.com", perms: ["team"] })).rejects.toThrow();
    const c = await addCollaborator({ db, actor: lead }, lead.perms, { email: "other@example.com", perms: ["support"] });
    expect(c.perms).toEqual(["businesses.read", "support"]);
    // Nobody changes their own access.
    const [me] = await db.select().from(adminCollaborators).where(eq(adminCollaborators.email, "lead@example.com"));
    await expect(updateCollaborator({ db, actor: lead }, lead.perms, me!.id, { perms: ["settings"] })).rejects.toThrow();
  });

  it("verification needs the numéro RC plus 3 matching answers; the records are compared, never returned", async () => {
    const db = getDb();
    const [r] = await db.select().from(restaurants).where(eq(restaurants.slug, "restaurant-demo"));
    const [code] = await db.select({ code: accessCodes.code }).from(accessCodes).where(and(eq(accessCodes.restaurantId, r!.id), isNull(accessCodes.seatId)));
    const bad = await verifyCaller(db, owner, r!.id, { callerName: "Awa", rc: code!.code, businessName: "Restaurant Démo", city: "Ouagadougou" });
    expect(bad.verified).toBe(false);
    const good = await verifyCaller(db, owner, r!.id, { callerName: "Awa", rc: `RC-${code!.code}`, businessName: "restaurant demo", city: "OUAGADOUGOU", phone: "70 00 00 02" });
    expect(good.verified).toBe(true);
    expect(good.checks).toMatchObject({ rc: true, name: true, city: true, phone: true });
    const wrongRc = await verifyCaller(db, owner, r!.id, { callerName: "Awa", rc: "RC-AAAAA", businessName: "restaurant demo", city: "Ouagadougou", phone: "70000002", callback: true });
    expect(wrongRc.verified).toBe(false);
    void members;
  });
});
