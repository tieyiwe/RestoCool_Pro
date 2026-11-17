import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { allow, DeviceId, notFound, publicRestaurant, Slug, tooMany } from "@/lib/public-api";
import { customerPaymentStatus } from "@/payments/customer";

export const dynamic = "force-dynamic";

const Query = z.object({ slug: Slug, deviceId: DeviceId });

/** The status of the customer's own online payment (polled by the payment status page). */
export async function GET(req: Request, { params }: { params: Promise<{ intent: string }> }) {
  const id = z.uuid().safeParse((await params).intent);
  const q = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!id.success || !q.success) return notFound();
  if (!allow(req, q.data.deviceId)) return tooMany();
  const r = await publicRestaurant(q.data.slug);
  if (!r) return notFound();
  const s = await customerPaymentStatus(getDb(), r.id, id.data, q.data.deviceId);
  if (!s) return notFound();
  return NextResponse.json(s, { headers: { "Cache-Control": "no-store" } });
}
