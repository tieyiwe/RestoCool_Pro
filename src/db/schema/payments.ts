import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { members, restaurants } from "./restaurants";
import { tableSessions } from "./seating";

export const PAYMENT_METHODS = ["cash", "orange_money", "moov_money", "card", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PROVIDER_IDS = ["manual", "cinetpay", "paydunya", "ligdicash", "orange_money", "moov_money"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const INTENT_PURPOSES = ["order", "session", "reservation_deposit", "plan_subscription"] as const;
export type IntentPurpose = (typeof INTENT_PURPOSES)[number];

export const INTENT_STATUSES = ["created", "pending", "succeeded", "failed", "cancelled", "expired", "refunded"] as const;
export type IntentStatus = (typeof INTENT_STATUSES)[number];

/**
 * A bill: what one table (session) or one order owes. It groups the orders it covers, the
 * adjustment for « sur demande » dishes, the discount, and what was paid so far (several payments
 * when the bill is split). When `paid` reaches `total`, the bill is settled and its orders become
 * « paid ». Amounts are integer FCFA, always computed on the server.
 */
export const bills = pgTable(
  "bills",
  {
    id: id(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => tableSessions.id, { onDelete: "set null" }),
    /** Orders this bill covers (frozen when the first payment is recorded). */
    orderIds: uuid("order_ids").array().notNull(),
    /** Seat at the time (« Table 4 », « À emporter »…), for the receipt and the closing. */
    seatLabel: text("seat_label"),
    seatType: text("seat_type"),
    /** Sum of the orders' priced dishes. */
    subtotal: integer("subtotal").notNull().default(0),
    /** Price of « sur demande » dishes, typed by the cashier. */
    adjustment: integer("adjustment").notNull().default(0),
    discount: integer("discount").notNull().default(0),
    discountReason: text("discount_reason"),
    discountBy: uuid("discount_by").references(() => members.id, { onDelete: "set null" }),
    /** subtotal + adjustment − discount */
    total: integer("total").notNull().default(0),
    paid: integer("paid").notNull().default(0),
    status: text("status").$type<"open" | "paid" | "void">().notNull().default("open"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /** Business day of the closing (Africa/Ouagadougou = UTC), set when settled. */
    businessDate: text("business_date"),
    createdBy: uuid("created_by").references(() => members.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("bills_restaurant_status_idx").on(t.restaurantId, t.status),
    index("bills_restaurant_day_idx").on(t.restaurantId, t.businessDate),
    index("bills_session_idx").on(t.sessionId),
    check("bills_amounts", sql`${t.subtotal} >= 0 and ${t.adjustment} >= 0 and ${t.discount} >= 0 and ${t.paid} >= 0`),
  ],
);
export type Bill = typeof bills.$inferSelect;

/**
 * One attempt to collect money, through a provider (section 8b). « manual » (staff record cash,
 * Orange Money, Moov… by hand) succeeds at once; online providers go created → pending →
 * succeeded | failed | expired. The same idempotency key never creates a second intent.
 */
export const paymentIntents = pgTable(
  "payment_intents",
  {
    id: id(),
    /** Null for platform payments that are not tied to one business (never today). */
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }),
    purpose: text("purpose").$type<IntentPurpose>().notNull(),
    /** Order id, session id, reservation id or restaurant id (plan), depending on the purpose. */
    purposeId: uuid("purpose_id").notNull(),
    billId: uuid("bill_id").references(() => bills.id, { onDelete: "set null" }),
    amount: integer("amount").notNull(),
    currency: text("currency").$type<"XOF">().notNull().default("XOF"),
    provider: text("provider").$type<ProviderId>().notNull(),
    method: text("method").$type<PaymentMethod>().notNull(),
    status: text("status").$type<IntentStatus>().notNull().default("created"),
    providerRef: text("provider_ref"),
    idempotencyKey: text("idempotency_key").notNull(),
    customerPhone: text("customer_phone"),
    returnUrl: text("return_url"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** "member:<userId>", "staff:<memberId>", "customer", "superadmin:<email>", "system". */
    createdBy: text("created_by"),
    lastError: text("last_error"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("payment_intents_idem_uq").on(t.idempotencyKey),
    index("payment_intents_restaurant_idx").on(t.restaurantId, t.createdAt),
    index("payment_intents_status_idx").on(t.status, t.createdAt),
    uniqueIndex("payment_intents_provider_ref_uq").on(t.provider, t.providerRef).where(sql`${t.providerRef} is not null`),
    check("payment_intents_amount", sql`${t.amount} > 0`),
  ],
);
export type PaymentIntent = typeof paymentIntents.$inferSelect;

/** Every webhook received from a provider (deduplicated on the provider's event id). */
export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: id(),
    provider: text("provider").$type<ProviderId>().notNull(),
    providerEventId: text("provider_event_id").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    signatureValid: boolean("signature_valid").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [uniqueIndex("payment_webhook_events_uq").on(t.provider, t.providerEventId)],
);

/**
 * A business's online payment provider. Credentials are encrypted with AES-256-GCM
 * (PAYMENT_ENCRYPTION_KEY); they are never sent to a browser or written to a log.
 */
export const paymentProviderConfigs = pgTable(
  "payment_provider_configs",
  {
    id: id(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    provider: text("provider").$type<ProviderId>().notNull(),
    enabled: boolean("enabled").notNull().default(false),
    mode: text("mode").$type<"test" | "live">().notNull().default("test"),
    /** iv.tag.ciphertext (base64url), or null when nothing is saved. */
    credentialsEncrypted: text("credentials_encrypted"),
    feePercent: real("fee_percent").notNull().default(0),
    feeFixed: integer("fee_fixed").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("payment_provider_configs_uq").on(t.restaurantId, t.provider)],
);

/**
 * Settled money: one row per successful payment (a part of a split bill is one row). Links to its
 * intent; cash keeps the amount received and the change given; mobile money keeps the reference.
 */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    billId: uuid("bill_id").references(() => bills.id, { onDelete: "set null" }),
    paymentIntentId: uuid("payment_intent_id").references(() => paymentIntents.id, { onDelete: "set null" }),
    sessionId: uuid("session_id").references(() => tableSessions.id, { onDelete: "set null" }),
    method: text("method").$type<PaymentMethod>().notNull(),
    /** What this payment settles (FCFA). */
    amount: integer("amount").notNull(),
    /** Cash: what the customer handed over, and the change given back. */
    received: integer("received"),
    changeGiven: integer("change_given"),
    /** Orange Money / Moov transaction id, card slip number… */
    reference: text("reference"),
    /** Split bill: « 1/3 », or the dishes this part covered (order item ids). */
    splitLabel: text("split_label"),
    items: jsonb("items").$type<string[]>(),
    /** Who recorded it (members.id). */
    staffId: uuid("staff_id").references(() => members.id, { onDelete: "set null" }),
    businessDate: text("business_date").notNull(),
    ...timestamps,
  },
  (t) => [
    index("payments_restaurant_day_idx").on(t.restaurantId, t.businessDate),
    index("payments_bill_idx").on(t.billId),
    uniqueIndex("payments_intent_uq").on(t.paymentIntentId).where(sql`${t.paymentIntentId} is not null`),
    check("payments_amount", sql`${t.amount} > 0`),
  ],
);
export type Payment = typeof payments.$inferSelect;
