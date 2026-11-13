import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { findRestaurantBySlug } from "@/db/repos/tenant";
import { getMemberContext } from "@/lib/auth/context";
import { hasFeature } from "@/lib/plan";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/** Anonymous device id generated on the customer's phone (localStorage). */
export const DeviceId = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);
export const Slug = z.string().regex(/^[a-z0-9-]{1,64}$/);

export const tooMany = () => NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "10" } });
export const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });

/**
 * 30 requests burst, 1 per second sustained, per IP + device. The device id is chosen by the
 * browser, so a fresh one per request must not escape the limit: one IP also has its own, larger
 * bucket (generous, since a restaurant's Wi-Fi or a mobile operator puts many phones behind one IP).
 */
export function allow(req: Request, deviceId = "-"): boolean {
  const ip = clientIp(req);
  return rateLimit(`ip:${ip}`, { capacity: 600, refillPerSec: 20 }) && rateLimit(`${ip}|${deviceId}`, { capacity: 30, refillPerSec: 1 });
}

/**
 * Restaurant for a public request: published, or unpublished when the caller is one of its members
 * (preview). Seating needs a plan with ordering (Pro / Business / trial).
 */
export async function publicRestaurant(slug: string) {
  const r = await publicBusiness(slug);
  if (!r || !hasFeature(r, "ordering")) return null;
  return r;
}

/** Like publicRestaurant, whatever the plan (features that check their own plan rule, e.g. reservations). */
export async function publicBusiness(slug: string) {
  const db = getDb();
  let r = await findRestaurantBySlug(db, slug);
  if (!r) {
    const draft = await findRestaurantBySlug(db, slug, { includeUnpublished: true });
    const member = draft ? await getMemberContext() : null;
    if (draft && member?.memberships.some((m) => m.restaurantId === draft.id)) r = draft;
  }
  return r ?? null;
}
