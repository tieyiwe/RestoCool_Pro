import "server-only";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { paymentIntents, paymentProviderConfigs, paymentWebhookEvents } from "@/db/schema";
import { log } from "@/lib/log";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { decryptJson } from "./crypto";
import { providerById } from "./registry";
import { closeIntent, settleIntent } from "./service";
import { ProviderNotConfiguredError } from "./types";

/**
 * A provider tells us a payment changed. Each business connects its own merchant account, so
 * the webhook URL names the business (/api/webhooks/payments/<provider>/<restaurantId>) and the
 * signature is checked with that business's own credentials.
 * 1. raw body, 2. signature (the adapter), 3. the event stored once (dedupe on the provider's
 * event id), 4. settle or close the intent in a transaction — the same event twice changes
 * nothing. The amount always comes from the intent (computed by the server), never the body.
 */
export async function handlePaymentWebhook(req: Request, providerId: string, restaurantId: string | null) {
  const provider = providerById(providerId);
  if (!provider || provider.id === "manual") return NextResponse.json({ error: "unknown_provider" }, { status: 404 });
  if (!rateLimit(`webhook:${providerId}:${clientIp(req)}`, { capacity: 120, refillPerSec: 2 })) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const raw = await req.text();
  if (raw.length > 64_000) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const db = getDb();

  let credentials: Record<string, string> | null = null;
  if (restaurantId) {
    const [c] = await db
      .select({ sealed: paymentProviderConfigs.credentialsEncrypted })
      .from(paymentProviderConfigs)
      .where(and(eq(paymentProviderConfigs.restaurantId, restaurantId), eq(paymentProviderConfigs.provider, provider.id)));
    if (!c?.sealed) return NextResponse.json({ error: "not_configured" }, { status: 404 });
    credentials = decryptJson(c.sealed);
  }

  let event;
  try {
    event = await provider.verifyWebhook(req, raw, { credentials });
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) return NextResponse.json({ error: "provider_not_configured" }, { status: 400 });
    log.warn("payment.webhook_verify_failed", { provider: providerId, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (!event) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });

  const [stored] = await db
    .insert(paymentWebhookEvents)
    .values({ provider: provider.id, providerEventId: event.eventId, payload: event.raw ?? {}, signatureValid: true })
    .onConflictDoNothing({ target: [paymentWebhookEvents.provider, paymentWebhookEvents.providerEventId] })
    .returning({ id: paymentWebhookEvents.id });
  if (!stored) return NextResponse.json({ ok: true, duplicate: true });

  try {
    const [intent] = await db
      .select()
      .from(paymentIntents)
      .where(
        and(
          eq(paymentIntents.provider, provider.id),
          eq(paymentIntents.providerRef, event.providerRef),
          restaurantId ? eq(paymentIntents.restaurantId, restaurantId) : undefined,
        ),
      );
    if (!intent) throw new Error("unknown provider ref");
    if (event.status === "succeeded") await settleIntent(db, intent.id, event.providerRef);
    else if (event.status !== "pending") await closeIntent(db, intent.id, event.status);
    await db.update(paymentWebhookEvents).set({ processedAt: new Date() }).where(eq(paymentWebhookEvents.id, stored.id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 300) : "error";
    await db.update(paymentWebhookEvents).set({ error: msg }).where(eq(paymentWebhookEvents.id, stored.id));
    log.error("payment.webhook_failed", { provider: providerId, error: msg });
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
