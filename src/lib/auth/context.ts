import "server-only";
import { cache } from "react";
import { getDb } from "@/db";
import { findRestaurantByClerkOrg, findRestaurantBySlug, tenantRepo, type TenantRepo } from "@/db/repos/tenant";
import { env } from "@/lib/env";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { ensureMember, ensureRestaurantForOrg, roleFromClerk } from "@/lib/restaurants/provision";
import { can, type Action, type Actor } from "./can";

type MemberActor = Extract<Actor, { kind: "member" }>;
type SuperadminActor = Extract<Actor, { kind: "superadmin" }>;

export type MemberContext = { actor: MemberActor; repo: TenantRepo };

async function clerkSession(): Promise<{ userId: string | null; orgId: string | null; orgRole: string | null }> {
  const { auth } = await import("@clerk/nextjs/server");
  const a = await auth();
  return { userId: a.userId ?? null, orgId: a.orgId ?? null, orgRole: a.orgRole ?? null };
}

/**
 * The signed-in owner/manager for the active Clerk Organization (= restaurant).
 * Returns null when signed out, when no org is active, or when the user is not a member.
 */
export const getMemberContext = cache(async (): Promise<MemberContext | null> => {
  const db = getDb();

  if (!env.clerkConfigured()) {
    if (!env.devAuthBypass()) return null;
    const r = await findRestaurantBySlug(db, env.devRestaurantSlug(), { includeUnpublished: true });
    if (!r) return null;
    return {
      actor: { kind: "member", userId: "dev-owner", restaurantId: r.id, role: "owner" },
      repo: tenantRepo(db, r.id),
    };
  }

  const { userId, orgId, orgRole } = await clerkSession();
  if (!userId || !orgId) return null;
  let r = await findRestaurantByClerkOrg(db, orgId);
  if (!r) {
    // Webhook not received yet: provision from Clerk directly (idempotent).
    const { clerkClient } = await import("@clerk/nextjs/server");
    const org = await (await clerkClient()).organizations.getOrganization({ organizationId: orgId });
    r = await ensureRestaurantForOrg(db, { id: org.id, name: org.name });
  }
  const repo = tenantRepo(db, r.id);
  let m = await repo.members.byClerkUser(userId);
  if (!m && orgRole) {
    // The session proves current org membership; record it with the mapped role.
    m = await ensureMember(db, r.id, { clerkUserId: userId, role: roleFromClerk(orgRole) });
    if (!m.active) return null;
  }
  if (!m) return null;
  return { actor: { kind: "member", userId, restaurantId: r.id, role: m.role }, repo };
});

/** Super admin = signed-in Clerk user whose primary email is in SUPERADMIN_EMAILS. */
export const getSuperadmin = cache(async (): Promise<SuperadminActor | null> => {
  if (!env.clerkConfigured()) {
    return env.devAuthBypass() ? { kind: "superadmin", userId: "dev-superadmin", email: "dev@localhost" } : null;
  }
  const { currentUser } = await import("@clerk/nextjs/server");
  const user = await currentUser();
  if (!user) return null;
  const allowed = env.superadminEmails();
  const email = user.emailAddresses
    .filter((e) => e.verification?.status === "verified")
    .map((e) => e.emailAddress.toLowerCase())
    .find((e) => allowed.has(e));
  return email ? { kind: "superadmin", userId: user.id, email } : null;
});

/** For route handlers / server actions: authenticated member allowed to do `action` in their restaurant. */
export async function requireMember(action: Action): Promise<MemberContext> {
  const ctx = await getMemberContext();
  if (!ctx) throw new UnauthorizedError();
  if (!can(ctx.actor, action, { restaurantId: ctx.repo.restaurantId })) throw new ForbiddenError();
  return ctx;
}

export async function requireSuperadmin(): Promise<SuperadminActor> {
  const sa = await getSuperadmin();
  if (!sa) throw new ForbiddenError();
  return sa;
}
