import { ProviderNotConfiguredError, type PaymentProvider } from "../types";

/**
 * Orange Money (direct): stub adapter. Not connected yet: every call refuses with ProviderNotConfiguredError,
 * so nothing can be charged by mistake. The same contract tests as « manual » run on it.
 *
 * TODO to connect it (one file, no change elsewhere):
 *  1. Sign the Orange Money Web Payment / merchant API contract for Burkina Faso; get client id, secret and merchant key.
 *  2. createPayment: get an OAuth token, then create a web payment (order_id = intentId, amount, currency OUV in test / XOF in live, notif_url); return the payment_url as a redirect, providerRef = pay_token.
 *  3. getStatus: transaction status endpoint with order_id + pay_token; SUCCESS → succeeded, FAILED → failed, EXPIRED → expired.
 *  4. verifyWebhook: check the notif_token matches the one returned at creation, then confirm with getStatus.
 *  5. Set `implemented: true`, add the credential fields to CREDENTIAL_FIELDS in ../registry.ts,
 *     and turn it on in Paramètres → « Paiements en ligne » (test mode first).
 */
export const orangemoneyProvider: PaymentProvider = {
  id: "orange_money",
  implemented: false,
  supports: { methods: ["orange_money"], refunds: false, currency: "XOF" },
  async createPayment() {
    throw new ProviderNotConfiguredError("orange_money");
  },
  async getStatus() {
    throw new ProviderNotConfiguredError("orange_money");
  },
  async verifyWebhook() {
    throw new ProviderNotConfiguredError("orange_money");
  },
};
