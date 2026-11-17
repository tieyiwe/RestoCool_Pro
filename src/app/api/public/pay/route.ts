import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { allow, DeviceId, notFound, publicRestaurant, Slug, tooMany } from "@/lib/public-api";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { publicBaseUrl } from "@/lib/urls";
import { CustomerPayError, CustomerPayInput, startCustomerPayment } from "@/payments/customer";
import { ProviderNotConfiguredError } from "@/payments/types";

export const dynamic = "force-dynamic";

const Body = CustomerPayInput.extend({ slug: Slug, deviceId: DeviceId });

/**
 * « Payer maintenant »: the customer pays their bill online through the business's own provider.
 * Answers what the phone must do next (open a page, dial a USSD code, or wait).
 */
export async function POST(req: Request) {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const { slug, deviceId, ...input } = p.data;
  if (!allow(req, deviceId) || !rateLimit(`pay:${clientIp(req)}|${deviceId}`, { capacity: 6, refillPerSec: 1 / 30 })) return tooMany();
  const r = await publicRestaurant(slug);
  if (!r) return notFound();
  try {
    const res = await startCustomerPayment(getDb(), r, deviceId, input, await publicBaseUrl());
    return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof CustomerPayError) return NextResponse.json({ error: err.code }, { status: err.code === "not_yours" ? 403 : 409 });
    if (err instanceof ProviderNotConfiguredError) return NextResponse.json({ error: "not_available" }, { status: 409 });
    throw err;
  }
}
