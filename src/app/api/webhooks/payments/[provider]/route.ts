import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { paymentIntents, paymentWebhookEvents } from "@/db/schema";
import { log } from "@/lib/log";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { providerById } from "@/payments/registry";
import { closeIntent, settleIntent } from "@/payments/service";
import { ProviderNotConfiguredError } from "@/payments/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/payments/<provider>: a provider tells us a payment changed.
 * 1. read the raw body, 2. verify the signature (the adapter), 3. store the event once (dedupe on
 * the provider's event id), 4. settle or close the intent in a transaction. Idempotent: the same
 * event twice changes nothing. Never trusts the amount from the body: the intent's amount is the
 * one computed by the server.
 */
export async function POST(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const id = (await params).provider;
  const provider = providerById(id);
  if (!provider || provider.id === "manual") return NextResponse.json({ error: "unknown_provider" }, { status: 404 });
  if (!rateLimit(`webhook:${id}:${clientIp(req)}`, { capacity: 120, refillPerSec: 2 })) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const raw = await req.text();
  if (raw.length > 64_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const db = getDb();

  let event;
  try {
    event = await provider.verifyWebhook(req, raw);
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) return NextResponse.json({ error: "provider_not_configured" }, { status: 400 });
    log.warn("payment.webhook_verify_failed", { provider: id, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (!event) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });

  const [stored] = await db
    .insert(paymentWebhookEvents)
    .values({ provider: provider.id, providerEventId: event.eventId, payload: event.raw ?? {}, signatureValid: true })
    .onConflictDoNothing({ target: [paymentWebhookEvents.provider, paymentWebhookEvents.providerEventId] })
    .returning({ id: paymentWebhookEvents.id });
  // Already received: nothing to do (idempotent).
  if (!stored) return NextResponse.json({ ok: true, duplicate: true });

  try {
    const [intent] = await db.select().from(paymentIntents).where(and(eq(paymentIntents.provider, provider.id), eq(paymentIntents.providerRef, event.providerRef)));
    if (!intent) throw new Error("unknown provider ref");
    if (event.status === "succeeded") await settleIntent(db, intent.id, event.providerRef);
    else if (event.status !== "pending") await closeIntent(db, intent.id, event.status);
    await db.update(paymentWebhookEvents).set({ processedAt: new Date() }).where(eq(paymentWebhookEvents.id, stored.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 300) : "error";
    await db.update(paymentWebhookEvents).set({ error: msg }).where(eq(paymentWebhookEvents.id, stored.id));
    log.error("payment.webhook_failed", { provider: id, error: msg });
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
