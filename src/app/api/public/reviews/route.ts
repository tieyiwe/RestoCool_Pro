import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { allow, DeviceId, notFound, publicRestaurant, Slug, tooMany } from "@/lib/public-api";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { publicReviews, ReviewError, ReviewInput, reviewsEnabled, submitReview } from "@/lib/reviews";

export const dynamic = "force-dynamic";

const Query = z.object({ slug: Slug, deviceId: DeviceId.optional(), offset: z.coerce.number().int().min(0).max(5000).optional() });

/** Visible reviews of a business, their average, and which of this phone's orders it already reviewed. */
export async function GET(req: Request) {
  const q = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (!allow(req, q.data.deviceId)) return tooMany();
  const r = await publicRestaurant(q.data.slug);
  if (!r) return notFound();
  if (!reviewsEnabled(r)) return NextResponse.json({ enabled: false }, { headers: { "Cache-Control": "no-store" } });
  const data = await publicReviews(getDb(), r.id, { deviceId: q.data.deviceId, offset: q.data.offset });
  return NextResponse.json({ enabled: true, ...data }, { headers: { "Cache-Control": "no-store" } });
}

const Body = ReviewInput.extend({ slug: Slug, deviceId: DeviceId });

/** A served customer leaves a review (one per order, from the phone that ordered). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { slug, deviceId, ...input } = parsed.data;
  const ip = clientIp(req);
  if (!allow(req, deviceId) || !rateLimit(`review:${ip}|${deviceId}`, { capacity: 5, refillPerSec: 1 / 120 }) || !rateLimit(`review-ip:${ip}`, { capacity: 30, refillPerSec: 1 / 20 })) return tooMany();
  const r = await publicRestaurant(slug);
  if (!r) return notFound();
  try {
    const id = await submitReview(getDb(), r, deviceId, input);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (err) {
    if (err instanceof ReviewError) return NextResponse.json({ error: err.code }, { status: err.code === "already" ? 409 : err.code === "disabled" ? 403 : 422 });
    throw err;
  }
}
