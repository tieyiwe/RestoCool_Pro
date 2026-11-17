import type { PaymentMethod, ProviderId } from "@/db/schema/payments";

export type { PaymentMethod, ProviderId };

/**
 * Payment providers (section 8b). Adding one = one adapter file in `providers/` + credentials in
 * Paramètres → « Paiements en ligne ». Orders, sessions, reservations and plans never change: they
 * only see payment intents succeed through `settleIntent` (src/payments/service.ts).
 */
export type CreatePaymentInput = {
  intentId: string;
  /** Integer FCFA, computed on the server (never from the client). */
  amount: number;
  currency: "XOF";
  method: PaymentMethod;
  description: string;
  customerPhone?: string | null;
  returnUrl?: string | null;
  /** Provider credentials, decrypted on the server for this call only. */
  credentials?: Record<string, string> | null;
  mode?: "test" | "live";
};

export type CreatePaymentResult =
  /** Settled at once (manual: the staff saw the money). */
  | { kind: "succeeded"; providerRef: string }
  /** The customer must go to the provider's page. */
  | { kind: "redirect"; url: string; providerRef: string }
  /** The customer dials a USSD code or approves on their phone. */
  | { kind: "ussd"; code: string; instructions?: string; providerRef: string }
  /** Waiting for the provider (webhook or reconciliation will finish it). */
  | { kind: "pending"; providerRef: string };

export type ProviderStatus = "pending" | "succeeded" | "failed" | "cancelled" | "expired" | "refunded";

export type VerifiedEvent = {
  /** Unique id of the event at the provider (deduplication). */
  eventId: string;
  providerRef: string;
  status: ProviderStatus;
  amount?: number;
  raw: unknown;
};

export type RefundResult = { ok: boolean; providerRef?: string; error?: string };

export interface PaymentProvider {
  id: ProviderId;
  supports: { methods: PaymentMethod[]; refunds: boolean; currency: "XOF" };
  /** True when this adapter really talks to the provider (stubs: false). */
  implemented: boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  getStatus(providerRef: string, ctx?: { credentials?: Record<string, string> | null; mode?: "test" | "live" }): Promise<ProviderStatus>;
  /** Checks the signature; null when invalid. Never trusts the body without it. */
  verifyWebhook(req: Request, rawBody: string, ctx?: { credentials?: Record<string, string> | null }): Promise<VerifiedEvent | null>;
  refund?(providerRef: string, amount: number): Promise<RefundResult>;
}

/** A provider whose adapter is not written yet (or not configured for this business). */
export class ProviderNotConfiguredError extends Error {
  constructor(readonly provider: ProviderId) {
    super(`payment provider « ${provider} » is not configured`);
  }
}
