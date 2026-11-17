import { ProviderNotConfiguredError, type PaymentProvider } from "../types";

/**
 * CinetPay: stub adapter. Not connected yet: every call refuses with ProviderNotConfiguredError,
 * so nothing can be charged by mistake. The same contract tests as « manual » run on it.
 *
 * TODO to connect it (one file, no change elsewhere):
 *  1. Create a merchant account at cinetpay.com and get the API key and site id (test and live).
 *  2. createPayment: POST https://api-checkout.cinetpay.com/v2/payment with transaction_id = intentId, amount, currency XOF, notify_url = APP_URL/api/webhooks/payments/cinetpay, return_url; return { kind: 'redirect', url: data.payment_url, providerRef: transaction_id }.
 *  3. getStatus: POST /v2/payment/check with transaction_id; map ACCEPTED → succeeded, REFUSED → failed, WAITING_FOR_CUSTOMER → pending.
 *  4. verifyWebhook: check the x-token HMAC (secret key) over the documented fields; then call getStatus (never trust the body alone).
 *  5. Set `implemented: true`, add the credential fields to CREDENTIAL_FIELDS in ../registry.ts,
 *     and turn it on in Paramètres → « Paiements en ligne » (test mode first).
 */
export const cinetpayProvider: PaymentProvider = {
  id: "cinetpay",
  implemented: false,
  supports: { methods: ["orange_money", "moov_money", "card"], refunds: false, currency: "XOF" },
  async createPayment() {
    throw new ProviderNotConfiguredError("cinetpay");
  },
  async getStatus() {
    throw new ProviderNotConfiguredError("cinetpay");
  },
  async verifyWebhook() {
    throw new ProviderNotConfiguredError("cinetpay");
  },
};
