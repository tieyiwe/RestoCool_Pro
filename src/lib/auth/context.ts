import "server-only";
import { cookies, headers } from "next/headers";
import { sql } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/db";
import { findRestaurantBySlug, membershipsForUser, tenantRepo, type Membership, type TenantRepo } from "@/db/repos/tenant";
import { env } from "@/lib/env";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
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

/** Super admin = signed-in Clerk user with a verified email listed in SUPERADMIN_EMAILS. */
export const getSuperadmin = cache(async (): Promise<SuperadminActor | null> => {
  if (!env.clerkConfigured()) {
    return (await bypass()) ? { kind: "superadmin", userId: DEV_USER.userId, email: DEV_USER.email! } : null;
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
