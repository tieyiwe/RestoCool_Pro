import { NextResponse } from "next/server";
import { handlePaymentWebhook } from "@/payments/webhook";

export const dynamic = "force-dynamic";

/** A business's own merchant account (its Orange Money / Moov / aggregator): checked with its credentials. */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string; restaurant: string }> }) {
  const { provider, restaurant } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(restaurant)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return handlePaymentWebhook(req, provider, restaurant);
}
