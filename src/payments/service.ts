import "server-only";
import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { bills, members, orders, paymentIntents, paymentProviderConfigs, payments, tableSessions, type PaymentIntent } from "@/db/schema";
import type { IntentPurpose, PaymentMethod } from "@/db/schema/payments";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/can";
import { log } from "@/lib/log";
import { notify } from "@/lib/realtime/events";
import { decryptJson } from "./crypto";
import { manualFor, providerById, type ResolvedProvider } from "./registry";
import { ProviderNotConfiguredError, type CreatePaymentResult } from "./types";

/** Online intents not paid within this time expire (the customer gave up). */
export const INTENT_TTL_MS = 30 * 60_000;
/** The reconciliation job asks providers about pending intents older than this. */
export const RECONCILE_AFTER_MS = 2 * 60_000;

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
const today = (now: Date) => now.toISOString().slice(0, 10);

export type StartInput = {
  restaurantId: string | null;
  purpose: IntentPurpose;
  purposeId: string;
  billId?: string | null;
  /** Integer FCFA computed by the server. */
  amount: number;
  method: PaymentMethod;
  /** Same key = same intent (a resend after a lost answer never charges twice). */
  idempotencyKey: string;
  createdBy: string;
  /** Who started it (audit log); null for customers and the system. */
  actor?: Actor | null;
  customerPhone?: string | null;
  returnUrl?: string | null;
  /** Kept with the intent and copied to the settled payment (cash received, reference, split…). */
  metadata?: Record<string, unknown>;
  description: string;
};

export type StartResult = { intent: PaymentIntent; next: CreatePaymentResult | null; reused: boolean };

/**
 * paymentService.start: one door for every payment, manual or online. Creates the intent (or
 * returns the one with the same idempotency key), calls the provider, and either settles it at
 * once (manual) or leaves it pending for the webhook / reconciliation.
 */
export async function startPayment(db: DB, input: StartInput, resolved: ResolvedProvider = manualFor(), now = new Date()): Promise<StartResult> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("invalid amount");
  const [created] = await db
    .insert(paymentIntents)
    .values({
      restaurantId: input.restaurantId,
      purpose: input.purpose,
      purposeId: input.purposeId,
      billId: input.billId ?? null,
      amount: input.amount,
      provider: resolved.provider.id,
      method: input.method,
      idempotencyKey: input.idempotencyKey,
      customerPhone: input.customerPhone ?? null,
      returnUrl: input.returnUrl ?? null,
      metadata: input.metadata ?? {},
      expiresAt: new Date(now.getTime() + INTENT_TTL_MS),
      createdBy: input.createdBy,
    })
    .onConflictDoNothing({ target: paymentIntents.idempotencyKey })
    .returning();
  if (!created) {
    const [existing] = await db.select().from(paymentIntents).where(eq(paymentIntents.idempotencyKey, input.idempotencyKey));
    return { intent: existing!, next: null, reused: true };
  }
  await audit(db, created, "payment.intent.created", undefined, input.actor);
  let next: CreatePaymentResult;
  try {
    next = await resolved.provider.createPayment({
      intentId: created.id,
      amount: created.amount,
      currency: "XOF",
      method: created.method,
      description: input.description,
      customerPhone: created.customerPhone,
      // A return URL ending with « / » gets the intent id (the customer comes back to its status page).
      returnUrl: created.returnUrl?.endsWith("/") ? `${created.returnUrl}${created.id}` : created.returnUrl,
      credentials: resolved.credentials,
      mode: resolved.mode,
    });
  } catch (err) {
    const msg = err instanceof ProviderNotConfiguredError ? "provider_not_configured" : err instanceof Error ? err.message.slice(0, 200) : "error";
    await db.update(paymentIntents).set({ status: "failed", lastError: msg, updatedAt: now }).where(eq(paymentIntents.id, created.id));
    await audit(db, { ...created, status: "failed" }, "payment.intent.failed", { error: msg }, input.actor);
    throw err;
  }
  if (next.kind === "succeeded") {
    const intent = await settleIntent(db, created.id, next.providerRef, now, input.actor);
    return { intent, next, reused: false };
  }
  const [pending] = await db
    .update(paymentIntents)
    .set({ status: "pending", providerRef: next.providerRef, updatedAt: now })
    .where(eq(paymentIntents.id, created.id))
    .returning();
  await audit(db, pending!, "payment.intent.pending", undefined, input.actor);
  return { intent: pending!, next, reused: false };
}

/**
 * The single place where money becomes « paid » (manual now, webhooks and reconciliation later).
 * Idempotent: settling an intent twice changes nothing. Updates the bill, the orders, frees the
 * table when its bill is settled, and sends the same live events as any other change.
 */
export async function settleIntent(db: DB, intentId: string, providerRef: string | null, now = new Date(), actor: Actor | null = null): Promise<PaymentIntent> {
  return db.transaction(async (tx) => {
    const [intent] = await tx.select().from(paymentIntents).where(eq(paymentIntents.id, intentId)).for("update");
    if (!intent) throw new Error("intent not found");
    if (intent.status === "succeeded") return intent;
    if (!["created", "pending"].includes(intent.status)) throw new Error(`intent is ${intent.status}`);
    const [done] = await tx
      .update(paymentIntents)
      .set({ status: "succeeded", providerRef: providerRef ?? intent.providerRef, updatedAt: now })
      .where(eq(paymentIntents.id, intent.id))
      .returning();
    await audit(tx, done!, "payment.intent.succeeded", undefined, actor);
    if ((intent.purpose === "order" || intent.purpose === "session") && intent.billId && intent.restaurantId) {
      await applyToBill(tx, done!, now);
    }
    return done!;
  });
}

/** Marks an intent failed / cancelled / expired / refunded (webhook or reconciliation). */
export async function closeIntent(db: DB | Tx, intentId: string, status: "failed" | "cancelled" | "expired" | "refunded", error?: string, now = new Date()) {
  const [row] = await db
    .update(paymentIntents)
    .set({ status, lastError: error ?? null, updatedAt: now })
    .where(and(eq(paymentIntents.id, intentId), inArray(paymentIntents.status, ["created", "pending"])))
    .returning();
  if (row) await audit(db, row, `payment.intent.${status}`, error ? { error } : undefined);
  return row ?? null;
}

async function applyToBill(tx: Tx, intent: PaymentIntent, now: Date) {
  const rid = intent.restaurantId!;
  const [bill] = await tx.select().from(bills).where(and(eq(bills.id, intent.billId!), eq(bills.restaurantId, rid))).for("update");
  if (!bill) return;
  const m = intent.metadata as { received?: number; changeGiven?: number; reference?: string; splitLabel?: string; items?: string[]; staffId?: string | null };
  await tx.insert(payments).values({
    restaurantId: rid,
    billId: bill.id,
    paymentIntentId: intent.id,
    sessionId: bill.sessionId,
    method: intent.method,
    amount: intent.amount,
    received: m.received ?? null,
    changeGiven: m.changeGiven ?? null,
    reference: m.reference ?? null,
    splitLabel: m.splitLabel ?? null,
    items: m.items ?? null,
    staffId: m.staffId ?? null,
    businessDate: today(now),
  });
  const paid = bill.paid + intent.amount;
  const settled = paid >= bill.total;
  await tx
    .update(bills)
    .set({ paid, updatedAt: now, ...(settled ? { status: "paid" as const, closedAt: now, businessDate: today(now) } : {}) })
    .where(eq(bills.id, bill.id));
  if (!settled) {
    // Live update for the staff screens following this bill.
    for (const oid of bill.orderIds) await notify(tx, { k: "order", r: rid, o: oid, s: bill.sessionId, d: null });
    return;
  }
  const paidOrders = await tx
    .update(orders)
    .set({ status: "paid", paidAt: now, paidBy: m.staffId ?? null, billId: bill.id, updatedBy: intent.createdBy, updatedAt: now })
    .where(and(eq(orders.restaurantId, rid), inArray(orders.id, bill.orderIds), sql`${orders.status} <> 'cancelled'`))
    .returning({ id: orders.id, s: orders.sessionId, d: orders.customerDeviceId });
  for (const o of paidOrders) await notify(tx, { k: "order", r: rid, o: o.id, s: o.s, d: o.d });
  // A table's bill settled: the table frees itself (« the session closes when it's paid »).
  if (bill.sessionId) {
    const [open] = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.sessionId, bill.sessionId), inArray(orders.status, ["sent", "confirmed", "preparing", "ready", "served"])))
      .limit(1);
    if (!open) {
      const closed = await tx
        .update(tableSessions)
        .set({ status: "closed", closedAt: now, closedReason: "paid" })
        .where(and(eq(tableSessions.id, bill.sessionId), eq(tableSessions.status, "open")))
        .returning({ id: tableSessions.id });
      if (closed.length) await notify(tx, { k: "session", r: rid, s: bill.sessionId });
    }
  }
}

async function audit(db: DB | Tx, intent: PaymentIntent, action: string, extra?: Record<string, unknown>, actor: Actor | null = null) {
  await writeAudit(db, actor, {
    restaurantId: intent.restaurantId,
    action,
    entity: "payment_intent",
    entityId: intent.id,
    data: { purpose: intent.purpose, amount: intent.amount, method: intent.method, provider: intent.provider, status: intent.status, by: intent.createdBy, ...extra },
  }).catch((err) => log.warn("payment.audit_failed", { error: err instanceof Error ? err.message : String(err) }));
}

/**
 * Reconciliation (every 5 min): pending online intents older than 2 minutes are checked with the
 * provider; abandoned ones expire. Manual intents are never pending.
 */
export async function reconcilePayments(db: DB, now = new Date()): Promise<{ checked: number; settled: number; expired: number }> {
  const due = await db
    .select()
    .from(paymentIntents)
    .where(
      and(
        inArray(paymentIntents.status, ["created", "pending"]),
        or(lt(paymentIntents.createdAt, new Date(now.getTime() - RECONCILE_AFTER_MS)), lt(paymentIntents.expiresAt, now)),
      ),
    )
    .limit(200);
  let settled = 0;
  let expired = 0;
  for (const i of due) {
    const p = providerById(i.provider);
    try {
      if (p && i.providerRef) {
        const st = await p.getStatus(i.providerRef, await credentialsOf(db, i.restaurantId, i.provider));
        if (st === "succeeded") {
          await settleIntent(db, i.id, i.providerRef, now);
          settled++;
          continue;
        }
        if (st === "failed" || st === "cancelled" || st === "expired" || st === "refunded") {
          await closeIntent(db, i.id, st, undefined, now);
          continue;
        }
      }
    } catch (err) {
      if (!(err instanceof ProviderNotConfiguredError)) log.warn("payment.reconcile_failed", { intent: i.id, error: err instanceof Error ? err.message : String(err) });
    }
    if (i.expiresAt && i.expiresAt.getTime() < now.getTime()) {
      if (await closeIntent(db, i.id, "expired", undefined, now)) expired++;
    }
  }
  return { checked: due.length, settled, expired };
}

/** A business's decrypted credentials for a provider (reconciliation, per-business accounts). */
async function credentialsOf(db: DB, restaurantId: string | null, provider: string) {
  if (!restaurantId) return { credentials: null };
  const [c] = await db
    .select({ sealed: paymentProviderConfigs.credentialsEncrypted, mode: paymentProviderConfigs.mode })
    .from(paymentProviderConfigs)
    .where(and(eq(paymentProviderConfigs.restaurantId, restaurantId), eq(paymentProviderConfigs.provider, provider as never)));
  return { credentials: c?.sealed ? decryptJson(c.sealed) : null, mode: c?.mode };
}

/** members.id → name + matricule, for receipts and the closing. */
export async function staffNames(db: DB, restaurantId: string, ids: string[]) {
  if (ids.length === 0) return new Map<string, { name: string | null; staffNo: number | null }>();
  const rows = await db.select({ id: members.id, name: members.name, staffNo: members.staffNo }).from(members).where(and(eq(members.restaurantId, restaurantId), inArray(members.id, ids)));
  return new Map(rows.map((r) => [r.id, { name: r.name, staffNo: r.staffNo }]));
}
