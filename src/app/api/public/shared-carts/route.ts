import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { allow, DeviceId, notFound, publicRestaurant, Slug, tooMany } from "@/lib/public-api";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createSharedCart, Name, SharedLineInput } from "@/lib/shared-carts";

export const dynamic = "force-dynamic";

const Body = z.object({ slug: Slug, deviceId: DeviceId, hostName: Name, lines: z.array(SharedLineInput).max(30).default([]) });

/** The host starts sharing their selection: returns the link token (shown once, to their phone only). */
export async function POST(req: Request) {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const ip = clientIp(req);
  if (!allow(req, p.data.deviceId) || !rateLimit(`share:${ip}|${p.data.deviceId}`, { capacity: 5, refillPerSec: 1 / 60 })) return tooMany();
  const r = await publicRestaurant(p.data.slug);
  if (!r) return notFound();
  const token = await createSharedCart(getDb(), r.id, p.data.deviceId, p.data.hostName, p.data.lines);
  return NextResponse.json({ token }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
