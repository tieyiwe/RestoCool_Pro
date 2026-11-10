import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { orderErrorResponse } from "@/lib/orders/http";
import { publicOrder } from "@/lib/orders/serialize";
import { CustomerOrderInput, ordersForCustomer, placeCustomerOrder } from "@/lib/orders/service";
import { allow, DeviceId, notFound, publicRestaurant, Slug, tooMany } from "@/lib/public-api";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const PostBody = CustomerOrderInput.extend({ slug: Slug, deviceId: DeviceId });

/** A customer sends their selection to the restaurant. */
export async function POST(req: Request) {
  const parsed = PostBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { slug, deviceId, ...input } = parsed.data;
  // General limit, plus at most a few orders a minute from one phone.
  if (!allow(req, deviceId) || !rateLimit(`order:${clientIp(req)}|${deviceId}`, { capacity: 6, refillPerSec: 1 / 30 })) return tooMany();
  const r = await publicRestaurant(slug);
  if (!r) return notFound();
  try {
    const order = await placeCustomerOrder(getDb(), r, deviceId, input);
    const { orders } = await ordersForCustomer(getDb(), r.id, deviceId, null);
    const full = orders.find((o) => o.id === order.id)!;
    return NextResponse.json({ order: publicOrder(full, deviceId) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return orderErrorResponse(err);
  }
}

const Query = z.object({ slug: Slug, deviceId: DeviceId, sessionId: z.uuid().optional() });

/** This phone's orders (and its table's, at a shared table), for live tracking. */
export async function GET(req: Request) {
  const q = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (!allow(req, q.data.deviceId)) return tooMany();
  const r = await publicRestaurant(q.data.slug);
  if (!r) return notFound();
  const { orders, sharedSessionId } = await ordersForCustomer(getDb(), r.id, q.data.deviceId, q.data.sessionId ?? null);
  return NextResponse.json({ orders: orders.map((o) => publicOrder(o, q.data.deviceId)), shared: Boolean(sharedSessionId) }, { headers: { "Cache-Control": "no-store" } });
}
