"use server";

import { and, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getLocale } from "next-intl/server";
import { getDb } from "@/db";
import { members } from "@/db/schema";
import { ACTIVE_RESTAURANT_COOKIE, getIdentityProfile, getMemberships, getVerifiedEmail } from "@/lib/auth/context";
import { sendWelcomeEmail } from "@/lib/email/welcome";
import { publicBaseUrl } from "@/lib/urls";
import { log } from "@/lib/log";
import { CreateRestaurantInput, MAX_OWNED_RESTAURANTS, createRestaurantForUser } from "@/lib/restaurants/provision";

const COOKIE_OPTS = { path: "/", httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 };

export type CreateRestaurantState = { error?: "name" | "limit" | "unknown" } | undefined;

export async function createRestaurantAction(_prev: CreateRestaurantState, formData: FormData): Promise<CreateRestaurantState> {
  const user = await getIdentityProfile();
  if (!user) redirect("/sign-in");

  const parsed = CreateRestaurantInput.safeParse({ name: formData.get("name"), city: formData.get("city") || undefined, kind: formData.get("kind") || undefined });
  if (!parsed.success) return { error: "name" };

  const db = getDb();
  const [owned] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(members)
    .where(and(eq(members.clerkUserId, user.userId), eq(members.role, "owner")));
  if ((owned?.n ?? 0) >= MAX_OWNED_RESTAURANTS) return { error: "limit" };

  let restaurantId: string;
  try {
    restaurantId = (await createRestaurantForUser(db, { clerkUserId: user.userId, email: user.email, name: user.name }, parsed.data)).id;
  } catch (err) {
    log.error("create_restaurant_failed", { err });
    return { error: "unknown" };
  }
  (await cookies()).set(ACTIVE_RESTAURANT_COOKIE, restaurantId, COOKIE_OPTS);
  // The welcome email leaves after the answer: the owner goes on with the setup without waiting.
  // Only to an address the sign-in provider verified.
  const [verified, locale, baseUrl] = await Promise.all([getVerifiedEmail(), getLocale(), publicBaseUrl()]);
  if (verified?.email) {
    const id = restaurantId;
    after(() => sendWelcomeEmail(db, { restaurantId: id, to: verified.email, ownerName: verified.name ?? user.name ?? null, locale, baseUrl }));
  }
  redirect("/app/onboarding/1");
}

/** Switch the active restaurant. Ignores ids the user is not a member of. */
export async function selectRestaurantAction(formData: FormData): Promise<void> {
  const wanted = formData.get("restaurantId");
  const memberships = await getMemberships();
  if (typeof wanted === "string" && memberships.some((m) => m.restaurantId === wanted)) {
    (await cookies()).set(ACTIVE_RESTAURANT_COOKIE, wanted, COOKIE_OPTS);
  }
  redirect("/app");
}
