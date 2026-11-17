import { ProviderNotConfiguredError, type PaymentProvider } from "../types";

/**
 * Moov Money (direct): stub adapter. Not connected yet: every call refuses with ProviderNotConfiguredError,
 * so nothing can be charged by mistake. The same contract tests as « manual » run on it.
 *
 * TODO to connect it (one file, no change elsewhere):
 *  1. Sign the Moov Money (Moov Africa Burkina) merchant API contract; get the credentials.
 *  2. createPayment: push a payment request to the customer's number (USSD prompt); return { kind: 'ussd', code, instructions, providerRef } or 'pending'.
 *  3. getStatus: transaction status by reference; map success / failure / timeout.
 *  4. verifyWebhook: verify the callback signature as documented by Moov, then confirm with getStatus.
 *  5. Set `implemented: true`, add the credential fields to CREDENTIAL_FIELDS in ../registry.ts,
 *     and turn it on in Paramètres → « Paiements en ligne » (test mode first).
 */
export const moovmoneyProvider: PaymentProvider = {
  id: "moov_money",
  implemented: false,
  supports: { methods: ["moov_money"], refunds: false, currency: "XOF" },
  async createPayment() {
    throw new ProviderNotConfiguredError("moov_money");
  },
  async getStatus() {
    throw new ProviderNotConfiguredError("moov_money");
  },
  async verifyWebhook() {
    throw new ProviderNotConfiguredError("moov_money");
  },
};
