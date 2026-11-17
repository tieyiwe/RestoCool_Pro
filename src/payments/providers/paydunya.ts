import { ProviderNotConfiguredError, type PaymentProvider } from "../types";

/**
 * PayDunya: stub adapter. Not connected yet: every call refuses with ProviderNotConfiguredError,
 * so nothing can be charged by mistake. The same contract tests as « manual » run on it.
 *
 * TODO to connect it (one file, no change elsewhere):
 *  1. Create a PayDunya business account; get the master key, private key and token (test and live).
 *  2. createPayment: create a checkout invoice (POST /api/v1/checkout-invoice/create), custom_data.intentId; return the invoice URL as a redirect, providerRef = token.
 *  3. getStatus: GET /api/v1/checkout-invoice/confirm/{token}; completed → succeeded, cancelled → cancelled.
 *  4. verifyWebhook: IPN hash = sha512(master key); compare in constant time, then confirm with getStatus.
 *  5. Set `implemented: true`, add the credential fields to CREDENTIAL_FIELDS in ../registry.ts,
 *     and turn it on in Paramètres → « Paiements en ligne » (test mode first).
 */
export const paydunyaProvider: PaymentProvider = {
  id: "paydunya",
  implemented: false,
  supports: { methods: ["orange_money", "moov_money", "card"], refunds: false, currency: "XOF" },
  async createPayment() {
    throw new ProviderNotConfiguredError("paydunya");
  },
  async getStatus() {
    throw new ProviderNotConfiguredError("paydunya");
  },
  async verifyWebhook() {
    throw new ProviderNotConfiguredError("paydunya");
  },
};
