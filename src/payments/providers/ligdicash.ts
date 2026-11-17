import { ProviderNotConfiguredError, type PaymentProvider } from "../types";

/**
 * Ligdicash: stub adapter. Not connected yet: every call refuses with ProviderNotConfiguredError,
 * so nothing can be charged by mistake. The same contract tests as « manual » run on it.
 *
 * TODO to connect it (one file, no change elsewhere):
 *  1. Get the Ligdicash API key and token for the business (Burkina Faso aggregator).
 *  2. createPayment: POST /pay/v01/redirect/checkout-invoice/create with the amount in XOF, custom_data.intentId, callback_url = APP_URL/api/webhooks/payments/ligdicash; return the redirect URL, providerRef = token.
 *  3. getStatus: GET /pay/v01/redirect/checkout-invoice/confirm/?invoiceToken=…; completed → succeeded.
 *  4. verifyWebhook: verify the callback's token, then confirm with getStatus.
 *  5. Set `implemented: true`, add the credential fields to CREDENTIAL_FIELDS in ../registry.ts,
 *     and turn it on in Paramètres → « Paiements en ligne » (test mode first).
 */
export const ligdicashProvider: PaymentProvider = {
  id: "ligdicash",
  implemented: false,
  supports: { methods: ["orange_money", "moov_money"], refunds: false, currency: "XOF" },
  async createPayment() {
    throw new ProviderNotConfiguredError("ligdicash");
  },
  async getStatus() {
    throw new ProviderNotConfiguredError("ligdicash");
  },
  async verifyWebhook() {
    throw new ProviderNotConfiguredError("ligdicash");
  },
};
