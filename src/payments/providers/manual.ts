import type { PaymentProvider } from "../types";

/**
 * « Manual »: what staff use today. The cashier saw the money (cash, Orange Money, Moov, card…)
 * and records it: the payment succeeds at once. No webhook, nothing to reconcile.
 */
export const manualProvider: PaymentProvider = {
  id: "manual",
  implemented: true,
  supports: { methods: ["cash", "orange_money", "moov_money", "card", "other"], refunds: false, currency: "XOF" },
  async createPayment(input) {
    if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("invalid amount");
    return { kind: "succeeded", providerRef: `manual:${input.intentId}` };
  },
  async getStatus(providerRef) {
    return providerRef.startsWith("manual:") ? "succeeded" : "failed";
  },
  async verifyWebhook() {
    // Manual payments never come from outside.
    return null;
  },
};
