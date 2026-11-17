import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { bills, orders, paymentIntents, paymentProviderConfigs, restaurants } from "@/db/schema";
import { PAYMENT_METHODS, type PaymentMethod } from "@/db/schema/payments";
import { openBillFor } from "@/lib/billing";
import { customerSession } from "@/lib/orders/service";
import { GROUP_SEATS } from "@/lib/seating/group-seats";
import { sha256 } from "@/lib/tokens";
import { onlineProviderFor, PROVIDERS } from "./registry";
import { startPayment } from "./service";

type Restaurant = typeof restaurants.$inferSelect;

/**
 * « Payer maintenant » (section 8b): the customer pays their bill from their phone through the
 * business's own connected provider (its Orange Money / Moov merchant account or an aggregator).
 * Hidden until the business has an enabled, implemented provider with credentials.
 */
export async function onlinePayMethods(db: DB, restaurantId: string): Promise<PaymentMethod[]> {
  const configs = await db
    .select({ provider: paymentProviderConfigs.provider, sealed: paymentProviderConfigs.credentialsEncrypted })
    .from(paymentProviderConfigs)
    .where(and(eq(paymentProviderConfigs.restaurantId, restaurantId), eq(paymentProviderConfigs.enabled, true)));
  const methods = new Set<PaymentMethod>();
  for (const c of configs) {
    const p = PROVIDERS[c.provider];
    if (p?.implemented && c.sealed) for (const m of p.supports.methods) if (m !== "cash") methods.add(m);
  }
  return PAYMENT_METHODS.filter((m) => methods.has(m));
}

export const CustomerPayInput = z.object({
  method: z.enum(PAYMENT_METHODS).exclude(["cash"]),
  /** The customer's own order, or their table's bill (the session they sit at). */
  orderId: z.uuid().optional(),
  sessionId: z.uuid().optional(),
  /** Mobile money: the number that pays (USSD push), optional for redirect providers. */
  phone: z.string().trim().regex(/^\+?[0-9 ]{8,16}$/).optional(),
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
});

export class CustomerPayError extends Error {
  constructor(readonly code: "not_available" | "not_yours" | "nothing_to_pay") {
    super(code);
  }
}

/** Starts an online payment of what is due; the amount is the bill's, computed on the server. */
export async function startCustomerPayment(db: DB, r: Restaurant, deviceId: string, input: z.infer<typeof CustomerPayInput>, returnBase: string) {
  const resolved = await onlineProviderFor(db, r.id, input.method);
  if (!resolved) throw new CustomerPayError("not_available");
  let target: { orderId: string } | { sessionId: string };
  if (input.sessionId) {
    const s = await customerSession(db, r.id, input.sessionId, deviceId);
    if (!s || !GROUP_SEATS.has(s.seat.type)) throw new CustomerPayError("not_yours");
    target = { sessionId: input.sessionId };
  } else if (input.orderId) {
    const [o] = await db.select({ device: orders.customerDeviceId }).from(orders).where(and(eq(orders.restaurantId, r.id), eq(orders.id, input.orderId)));
    if (!o || o.device !== deviceId) throw new CustomerPayError("not_yours");
    target = { orderId: input.orderId };
  } else throw new CustomerPayError("not_yours");
  let bill;
  try {
    bill = await openBillFor({ db, restaurantId: r.id, createdBy: null }, target);
  } catch {
    throw new CustomerPayError("nothing_to_pay");
  }
  const due = bill.total - bill.paid;
  if (bill.status !== "open" || due <= 0) throw new CustomerPayError("nothing_to_pay");
  const idempotencyKey = `customer:${bill.id}:${input.requestId}`;
  const res = await startPayment(
    db,
    {
      restaurantId: r.id,
      purpose: bill.orderIds.length === 1 || !bill.sessionId ? "order" : "session",
      purposeId: bill.orderIds.length === 1 || !bill.sessionId ? bill.orderIds[0]! : bill.sessionId,
      billId: bill.id,
      amount: due,
      method: input.method,
      idempotencyKey,
      createdBy: "customer",
      customerPhone: input.phone ?? null,
      returnUrl: `${returnBase}/r/${r.slug}/paiement/`,
      metadata: { deviceHash: sha256(deviceId), splitLabel: "online" },
      description: `${r.name} ${bill.seatLabel ?? ""}`.trim(),
    },
    resolved,
  );
  return { intentId: res.intent.id, status: res.intent.status, next: res.next };
}

/** What the customer's phone may know about its own payment (status only). */
export async function customerPaymentStatus(db: DB, restaurantId: string, intentId: string, deviceId: string) {
  const [i] = await db.select().from(paymentIntents).where(and(eq(paymentIntents.id, intentId), eq(paymentIntents.restaurantId, restaurantId)));
  if (!i || (i.metadata as { deviceHash?: string }).deviceHash !== sha256(deviceId)) return null;
  const [b] = i.billId ? await db.select({ status: bills.status, total: bills.total, paid: bills.paid }).from(bills).where(eq(bills.id, i.billId)) : [];
  return { status: i.status, amount: i.amount, method: i.method, billSettled: b?.status === "paid" };
}
