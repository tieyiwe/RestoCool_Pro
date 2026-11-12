import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/db";
import { findRestaurantBySlug, membershipsForUser, tenantRepo, type Membership, type TenantRepo } from "@/db/repos/tenant";
import { adminCollaborators } from "@/db/schema";
import { ADMIN_PERMS, hasPerm, normalizePerms, type AdminAccess, type AdminPerm } from "@/lib/admin/access";
import { writeAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "@/lib/errors";
import { sessionFromToken, STAFF_COOKIE } from "@/lib/devices";
import { cleanAccess } from "./access";
import { can, type Action, type Actor } from "./can";

type MemberActor = Extract<Actor, { kind: "member" }>;
type SuperadminActor = Extract<Actor, { kind: "superadmin" }>;

export type Identity = { userId: string; email: string | null; name: string | null };
export type MemberContext = {
  actor: MemberActor;
  repo: TenantRepo;
  memberships: Membership[];
  /** Set when the person logged in with their PIN on an authorised device. */
  pin?: { memberId: string; name: string; staffNo: number | null; idleMinutes: number; deviceName: string };
};

/**
 * The person logged in with their PIN on this authorised device, if any. It comes first: on a
 * shared tablet, whoever unlocked it with their PIN is the one acting.
 */
export const getStaffSessionContext = cache(async (): Promise<MemberContext | null> => {
  const token = (await cookies()).get(STAFF_COOKIE)?.value;
  if (!token) return null;
  const s = await sessionFromToken(getDb(), token);
  if (!s) return null;
  const m = s.member;
  void touchLastSeen(m.id);
  return {
    actor: {
      kind: "member",
      userId: `pin:${m.id}`,
      restaurantId: s.restaurant.id,
      role: m.role,
      memberId: m.id,
      via: "pin",
      ...(s.access ? { access: s.access } : {}),
    },
    repo: tenantRepo(getDb(), s.restaurant.id),
    memberships: [{ memberId: m.id, role: m.role, access: s.access, restaurantId: s.restaurant.id, restaurantName: s.restaurant.name, restaurantSlug: s.restaurant.slug }],
    pin: { memberId: m.id, name: m.name ?? "—", staffNo: m.staffNo, idleMinutes: s.idleMinutes, deviceName: s.device.name },
  };
});

/** Cookie holding the restaurant the user is currently working in (validated against memberships). */
export const ACTIVE_RESTAURANT_COOKIE = "rc_restaurant";

const DEV_USER: Identity = { userId: "dev-owner", email: "dev@localhost", name: "Dev" };

/** Dev sign-in bypass, only for requests made to localhost (see env.devAuthBypass). */
async function bypass(): Promise<boolean> {
  return env.devAuthBypass((await headers()).get("host"));
}

/** Who is signed in (Clerk proves identity only; restaurants come from our members table). */
export const getIdentity = cache(async (): Promise<Identity | null> => {
  if (!env.clerkConfigured()) return (await bypass()) ? DEV_USER : null;
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  return userId ? { userId, email: null, name: null } : null;
});

/** Email and display name, fetched from Clerk only when needed (e.g. creating a restaurant). */
export async function getIdentityProfile(): Promise<Identity | null> {
  const id = await getIdentity();
  if (!id || !env.clerkConfigured()) return id;
  const { currentUser } = await import("@clerk/nextjs/server");
  const user = await currentUser();
  if (!user) return null;
  return {
    userId: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
    name: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
  };
}

/**
 * The signed-in user's primary email, only if the identity provider verified it (Google sign-in
 * or a confirmed code). Used to hand over businesses prepared for this email.
 */
export async function getVerifiedEmail(): Promise<{ userId: string; email: string; name: string | null } | null> {
  const id = await getIdentity();
  if (!id) return null;
  if (!env.clerkConfigured()) return id.email ? { userId: id.userId, email: id.email, name: id.name } : null;
  const { currentUser } = await import("@clerk/nextjs/server");
  const user = await currentUser();
  const primary = user?.primaryEmailAddress;
  if (!user || !primary || primary.verification?.status !== "verified") return null;
  return { userId: user.id, email: primary.emailAddress, name: [user.firstName, user.lastName].filter(Boolean).join(" ") || null };
}

/** All restaurants the signed-in user can work in. */
export const getMemberships = cache(async (): Promise<Membership[]> => {
  const id = await getIdentity();
  if (!id) return [];
  const db = getDb();
  const rows = await membershipsForUser(db, id.userId);
  if (id === DEV_USER) {
    // Dev bypass: also act as owner of the demo restaurant without a member row.
    const demo = await findRestaurantBySlug(db, env.devRestaurantSlug(), { includeUnpublished: true });
    if (demo && !rows.some((m) => m.restaurantId === demo.id)) {
      rows.unshift({ memberId: "dev", role: "owner", access: null, restaurantId: demo.id, restaurantName: demo.name, restaurantSlug: demo.slug });
    }
  }
  return rows;
});

/**
 * The signed-in member in their active restaurant. The restaurant comes from the cookie
 * only if the user really is a member of it; otherwise their first restaurant.
 * Returns null when signed out or when the user has no restaurant yet.
 */
export const getMemberContext = cache(async (): Promise<MemberContext | null> => {
  const staff = await getStaffSessionContext();
  if (staff) return staff;
  const id = await getIdentity();
  if (!id) return null;
  const memberships = await getMemberships();
  if (memberships.length === 0) return null;
  const wanted = (await cookies()).get(ACTIVE_RESTAURANT_COOKIE)?.value;
  const active = memberships.find((m) => m.restaurantId === wanted) ?? memberships[0]!;
  if (active.memberId !== "dev") void touchLastSeen(active.memberId);
  return {
    actor: {
      kind: "member",
      userId: id.userId,
      restaurantId: active.restaurantId,
      role: active.role,
      ...(active.memberId !== "dev" ? { memberId: active.memberId } : {}),
      ...(active.access ? { access: cleanAccess(active.access) } : {}),
    },
    repo: tenantRepo(getDb(), active.restaurantId),
    memberships,
  };
});

/** Dev bypass only (never production): « 1 » = the dev user is not super admin (tests of the refusal). */
export const DEV_NOT_SUPERADMIN_COOKIE = "rc_dev_not_superadmin";
/** Dev bypass only: act as this collaborator email (tests of permissions). */
export const DEV_ADMIN_AS_COOKIE = "rc_dev_admin_as";

export type AdminActor = SuperadminActor & AdminAccess & { name: string | null; role?: string };

/** A collaborator's row, if this verified email is an active collaborator. Last seen kept fresh (5 min). */
async function collaboratorAccess(email: string): Promise<(AdminAccess & { name: string | null; role: string }) | null> {
  const db = getDb();
  const [c] = await db.select().from(adminCollaborators).where(and(eq(adminCollaborators.email, email), eq(adminCollaborators.active, true))).limit(1);
  if (!c) return null;
  if (!c.lastSeenAt || Date.now() - c.lastSeenAt.getTime() > 5 * 60_000) {
    void db.update(adminCollaborators).set({ lastSeenAt: new Date() }).where(eq(adminCollaborators.id, c.id)).catch(() => {});
  }
  return { owner: false, perms: new Set(normalizePerms(c.perms)), name: c.name, role: c.role };
}

async function accessFor(userId: string, emails: string[], name: string | null): Promise<AdminActor | null> {
  const owners = env.superadminEmails();
  const owner = emails.find((e) => owners.has(e));
  if (owner) return { kind: "superadmin", userId, email: owner, owner: true, perms: new Set(ADMIN_PERMS), name };
  for (const email of emails) {
    const c = await collaboratorAccess(email);
    if (c) return { kind: "superadmin", userId, email, ...c, name: c.name ?? name };
  }
  return null;
}

/**
 * Console access: a signed-in Clerk user whose verified email is listed in SUPERADMIN_EMAILS
 * (owner: everything) or is an active collaborator (their permissions only).
 */
export const getSuperadmin = cache(async (): Promise<AdminActor | null> => {
  if (!env.clerkConfigured()) {
    if (!(await bypass())) return null;
    // Local development only: the cookies let tests act as someone else.
    const jar = await cookies();
    if (jar.get(DEV_NOT_SUPERADMIN_COOKIE)?.value === "1") return null;
    const as = jar.get(DEV_ADMIN_AS_COOKIE)?.value?.toLowerCase();
    if (as) {
      const c = await collaboratorAccess(as);
      return c ? { kind: "superadmin", userId: DEV_USER.userId, email: as, ...c } : null;
    }
    return { kind: "superadmin", userId: DEV_USER.userId, email: DEV_USER.email!, owner: true, perms: new Set(ADMIN_PERMS), name: DEV_USER.name };
  }
  const { currentUser } = await import("@clerk/nextjs/server");
  const user = await currentUser();
  if (!user) return null;
  const emails = user.emailAddresses.filter((e) => e.verification?.status === "verified").map((e) => e.emailAddress.toLowerCase());
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
  return accessFor(user.id, emails, name);
});

/** For route handlers / server actions: authenticated member allowed to do `action` in their restaurant. */
export async function requireMember(action: Action): Promise<MemberContext> {
  const ctx = await getMemberContext();
  if (!ctx) throw new UnauthorizedError();
  if (!can(ctx.actor, action, { restaurantId: ctx.repo.restaurantId })) throw new ForbiddenError();
  return ctx;
}

/**
 * The console answers « not found » to anyone who is not in it (signed out, or signed in
 * without an authorised verified email): it never confirms that it exists. A collaborator
 * without the permission gets « forbidden ».
 */
export async function requireSuperadmin(perm?: AdminPerm): Promise<AdminActor> {
  const sa = await getSuperadmin();
  if (!sa) throw new NotFoundError();
  if (perm && !hasPerm(sa, perm)) throw new ForbiddenError();
  return sa;
}

/**
 * Console activity log: « signed in » after 30 min without activity, and each page opened (the
 * same page counts once per 10 min). In memory throttling (one long-lived process); never blocks.
 */
const consoleSeen = (globalThis as unknown as { __rcConsoleSeen?: Map<string, number> }).__rcConsoleSeen ?? new Map<string, number>();
(globalThis as unknown as { __rcConsoleSeen?: Map<string, number> }).__rcConsoleSeen = consoleSeen;
async function logConsoleVisit(sa: AdminActor) {
  try {
    const path = (await headers()).get("x-rc-path");
    const now = Date.now();
    if (consoleSeen.size > 5000) consoleSeen.clear();
    const db = getDb();
    const last = consoleSeen.get(`s:${sa.email}`) ?? 0;
    consoleSeen.set(`s:${sa.email}`, now);
    if (now - last > 30 * 60_000) await writeAudit(db, sa, { restaurantId: null, action: "admin.signed_in", entity: "console", data: { owner: sa.owner } });
    if (path && now - (consoleSeen.get(`v:${sa.email}:${path}`) ?? 0) > 10 * 60_000) {
      consoleSeen.set(`v:${sa.email}:${path}`, now);
      await writeAudit(db, sa, { restaurantId: null, action: "admin.viewed", entity: "console", entityId: path.split("?")[0]!.slice(0, 200), data: { path } });
    }
  } catch {
    /* never block a page for the log */
  }
}

/** Same, for console pages: the site's normal 404 page; a missing permission goes to the overview. */
export async function requireSuperadminPage(perm?: AdminPerm): Promise<AdminActor> {
  const sa = await getSuperadmin();
  if (!sa) notFound();
  await logConsoleVisit(sa);
  if (perm && !hasPerm(sa, perm)) redirect("/admin_pro?denied=1");
  return sa;
}

/** « Actively using the app »: one cheap write at most every 5 minutes per person; never blocks a page. */
async function touchLastSeen(memberId: string) {
  try {
    await getDb().execute(
      sql`update members set last_seen_at = now() where id = ${memberId} and (last_seen_at is null or last_seen_at < now() - interval '5 minutes')`,
    );
  } catch {
    // Activity tracking must never break a page.
  }
}
