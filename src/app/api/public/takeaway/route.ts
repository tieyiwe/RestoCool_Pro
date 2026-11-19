import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { orderErrorResponse } from "@/lib/orders/http";
import { placeWhatsappOrder, WhatsappOrderInput } from "@/lib/orders/whatsapp";
import { allow, DeviceId, notFound, publicRestaurant, Slug, tooMany } from "@/lib/public-api";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const Body = WhatsappOrderInput.extend({ slug: Slug, deviceId: DeviceId });

/** A takeaway order sent by WhatsApp is recorded too, so the business sees it on its dashboard. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { slug, deviceId, ...input } = parsed.data;
  const ip = clientIp(req);
  if (!allow(req, deviceId) || !rateLimit(`wa-order:${ip}|${deviceId}`, { capacity: 6, refillPerSec: 1 / 30 }) || !rateLimit(`wa-order-ip:${ip}`, { capacity: 60, refillPerSec: 1 / 5 })) return tooMany();
  const r = await publicRestaurant(slug);
  if (!r) return notFound();
  try {
    const o = await placeWhatsappOrder(getDb(), r, deviceId, input);
    return NextResponse.json({ number: o.number, code: o.code }, { status: 201 });
  } catch (err) {
    return orderErrorResponse(err);
  }
}
