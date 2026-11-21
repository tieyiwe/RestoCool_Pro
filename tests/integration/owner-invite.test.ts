import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { closeDb, getDb } = await import("@/db");
const { members, restaurants } = await import("@/db/schema");
const { createRestaurantForUser } = await import("@/lib/restaurants/provision");
const { claimBusinessesByEmail } = await import("@/lib/restaurants/claim");
const inv = await import("@/lib/restaurants/owner-invite");

const hasDb = Boolean(process.env.DATABASE_URL);
const sa = { kind: "superadmin" as const, userId: "sa_invite", email: "admin@example.com", owner: true, perms: new Set<never>(), name: null };

describe.skipIf(!hasDb)("owner invitations for prepared businesses (database)", () => {
  type R = typeof restaurants.$inferSelect;
  let r: R;
  const ctx = () => ({ db: getDb(), actor: sa as never });

  beforeAll(async () => {
    const db = getDb();
    // A business prepared by RestoCool: created, then its owner membership removed (nobody owns it).
    r = await createRestaurantForUser(db, { clerkUserId: "it-invite-builder" }, { name: "Maquis Invitation", city: "Ouagadougou" });
    await db.delete(members).where(eq(members.restaurantId, r.id));
  });
  afterAll(async () => {
    await getDb().delete(restaurants).where(inArray(restaurants.id, [r.id]));
    await closeDb();
  });

  it("creates a link for the business address, valid 30 days, and records the owner email", async () => {
    const { invite } = await inv.inviteOwner(ctx(), r.id, { email: "  Owner@Example.com ", lang: "fr" });
    expect(invite.email).toBe("owner@example.com");
    expect(invite.token.length).toBeGreaterThanOrEqual(24);
    expect(inv.inviteUrl("https://restocool.com", r.slug, invite.token)).toBe(`https://restocool.com/r/${r.slug}/proprietaire/${invite.token}`);
    const found = await inv.findOwnerInvite(getDb(), r.slug, invite.token);
    expect(found).toMatchObject({ state: "open", email: "owner@example.com" });
    const [row] = await getDb().select().from(restaurants).where(eq(restaurants.id, r.id));
    expect(row!.settings.ownerEmail).toBe("owner@example.com");
    // Days: 30 (± a minute).
    expect(Math.round((new Date(invite.expiresAt).getTime() - Date.now()) / 86_400_000)).toBe(30);
  });

  it("refuses a wrong code, another business's address, and an expired link; a new link replaces the old one", async () => {
    const db = getDb();
    const { invite: first } = await inv.inviteOwner(ctx(), r.id, { email: "owner@example.com", lang: "en" });
    expect(first.count).toBe(2);
    expect((await inv.findOwnerInvite(db, r.slug, "x".repeat(first.token.length))).state).toBe("invalid");
    expect((await inv.findOwnerInvite(db, "restaurant-demo", first.token)).state).toBe("invalid");
    expect((await inv.findOwnerInvite(db, r.slug, first.token, new Date(Date.now() + 31 * 86_400_000))).state).toBe("expired");
    const { invite: second } = await inv.inviteOwner(ctx(), r.id, { email: "owner@example.com", lang: "fr" });
    expect((await inv.findOwnerInvite(db, r.slug, first.token)).state).toBe("invalid");
    expect((await inv.findOwnerInvite(db, r.slug, second.token)).state).toBe("open");
  });

  it("cancelling stops the link and the email claim", async () => {
    const db = getDb();
    const { invite } = await inv.inviteOwner(ctx(), r.id, { email: "owner@example.com", lang: "fr" });
    await inv.cancelOwnerInvite(ctx(), r.id);
    expect((await inv.findOwnerInvite(db, r.slug, invite.token)).state).toBe("invalid");
    expect(await claimBusinessesByEmail(db, { clerkUserId: "it-invite-owner", verifiedEmail: "owner@example.com" })).toEqual([]);
  });

  it("only the invited (verified) email takes the business; then the link says it is taken and no new invitation is possible", async () => {
    const db = getDb();
    const { invite } = await inv.inviteOwner(ctx(), r.id, { email: "owner@example.com", lang: "fr" });
    expect(await claimBusinessesByEmail(db, { clerkUserId: "it-invite-other", verifiedEmail: "someone@example.com" })).toEqual([]);
    expect(await claimBusinessesByEmail(db, { clerkUserId: "it-invite-owner", verifiedEmail: "owner@example.com", name: "Awa" })).toEqual([r.id]);
    const [owner] = await db.select().from(members).where(and(eq(members.restaurantId, r.id), eq(members.role, "owner")));
    expect(owner).toMatchObject({ clerkUserId: "it-invite-owner", email: "owner@example.com" });
    const [row] = await db.select().from(restaurants).where(eq(restaurants.id, r.id));
    expect(row!.settings.ownerInvite).toBeUndefined();
    expect(row!.settings.ownerEmail).toBeUndefined();
    expect((await inv.findOwnerInvite(db, r.slug, invite.token)).state).toBe("owned");
    await expect(inv.inviteOwner(ctx(), r.id, { email: "x@example.com", lang: "fr" })).rejects.toBeInstanceOf(inv.OwnerExistsError);
  });

  it("masks the email on the public page", () => {
    expect(inv.maskEmail("awatraore@gmail.com")).toBe("aw••••••@gmail.com");
    expect(inv.maskEmail("ab@x.bf")).toBe("ab••@x.bf");
  });
});
