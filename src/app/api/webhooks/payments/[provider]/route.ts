import { handlePaymentWebhook } from "@/payments/webhook";

export const dynamic = "force-dynamic";

/** Platform-level webhook (aggregator accounts shared by the platform, e.g. plan payments). */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  return handlePaymentWebhook(req, (await params).provider, null);
}
