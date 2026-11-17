# 8. Connecting a business's own Orange Money, Moov Money or aggregator (online payment)

**Status today:** the plumbing is built and tested, but **no online provider is switched on yet**. Every business collects with the cash register (« 💰 Caisse »): cash, Orange Money or Moov Money confirmed by hand with the transaction reference. This document says what to do, later, when a business wants its customers to **pay the bill from their phone** with the money going **straight to the business's own merchant account**.

---

## How it works (in one picture)

1. The customer opens « Mes commandes » and taps **« 💳 Payer maintenant »**, chooses Orange Money / Moov Money (or card), types their number if needed.
2. RestoCool computes the amount **on the server** from the bill (never from the phone) and asks the business's provider to collect it.
3. The customer approves on their phone (USSD code, or the provider's payment page).
4. The provider notifies RestoCool on the business's **webhook address**. RestoCool checks the signature, records the payment once (the same notification twice changes nothing), marks the bill paid, frees the table and updates the staff and customer screens live.
5. If a notification is lost, RestoCool asks the provider every 5 minutes for payments still pending; after 30 minutes without an answer the attempt expires and nothing is charged.

The money never transits through TIBLOGICS: it goes from the customer's wallet to the business's merchant account. RestoCool only records it in the cash register, the receipt and the « Clôture de caisse ».

**The button stays hidden** for customers until the business has a provider that is (1) written by the RestoCool team, (2) enabled, (3) holding credentials. Today all providers show « Bientôt ».

---

## A. What the business owner does

**Before (1 to 3 weeks, with the operator):**

1. Choose the way to collect:
   - **Orange Money merchant account** (Orange Burkina, « Orange Money Web Payment » / marchand API);
   - **Moov Money merchant account** (Moov Africa Burkina);
   - or **one aggregator** that covers both and cards: CinetPay, PayDunya or Ligdicash. Simpler: one contract, one set of credentials.
2. Open the merchant account with the documents the operator asks for (RCCM, IFU, ID of the manager, bank or wallet to receive the money).
3. Ask the operator for the **API credentials** (test and live): API key, site ID, client ID/secret, merchant key… depending on the provider.

**In RestoCool (10 minutes), Paramètres → « Paiements » (`/app/settings/payments`):**

4. Open « Comment connecter votre Orange Money, Moov Money ou un agrégateur ? »: the same steps are written there.
5. If your provider shows **« Bientôt »**, send a request from 🛟 « Aide et signalement »: the RestoCool team connects it (section B). You do not need to wait for it to prepare your merchant account.
6. When the provider is available: choose mode **« Test »**, paste the credentials and save. They are encrypted and **never shown again** (to change them, type new ones).
7. Copy the **webhook address** shown under the provider, for example
   `https://restocool.com/api/webhooks/payments/cinetpay/<your business id>`,
   and paste it in the merchant dashboard (« URL de notification » / « Callback URL » / « IPN »).
8. Tap **« Tester la connexion »**.
9. Make a small test payment from your own menu (a 100 F dish) and check it appears in « 💰 Caisse » and the « Clôture de caisse ».
10. Switch to mode **« Réel »** with the live credentials, tick **« Activer »**, save. « Payer maintenant » now appears for your customers.

**Every day:** nothing changes for the staff. Online payments appear in the « Caisse » and the closing like the others, with the operator's reference. Cashiers still collect cash and hand-confirmed mobile money as before.

**Never:** send your API keys by WhatsApp or email, even to RestoCool. Type them only in Paramètres → « Paiements ».

---

## B. What the TIBLOGICS team does (once per provider, then for every business)

**Once on the platform:**

1. Make sure the Replit secret **`PAYMENT_ENCRYPTION_KEY`** exists: 64 hexadecimal characters (32 random bytes). Generate it once in the Replit Shell with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Paste the result into Replit → Secrets. **Never change it** once a business has saved credentials: they could no longer be read.
2. Make sure `APP_URL` is `https://restocool.com` (the webhook addresses shown to owners are built from it).

**Once per provider (a developer, about 1 to 3 days with the provider's sandbox):**

3. Open the adapter file in `src/payments/providers/` (`cinetpay.ts`, `paydunya.ts`, `ligdicash.ts`, `orange_money.ts`, `moov_money.ts`). The **TODO list at the top** gives the exact steps for that provider.
4. Write `createPayment` (return a redirect URL, a USSD code or « pending »), `getStatus` and `verifyWebhook` (check the signature with the business's credentials, which arrive decrypted in `ctx.credentials`). Set `implemented: true` and list the credential fields in `CREDENTIAL_FIELDS` in `src/payments/registry.ts`.
5. Run the contract tests (`npm test`): the same tests as the « manual » provider run on every adapter.
6. Test end to end in the provider's sandbox with a test business (section A, steps 6 to 9).
7. Ship (git pull + Republish). Nothing else changes: orders, bills, sessions, reservations and plans already go through the same payment layer.

**For each business that asks:**

8. Answer its support request, check its merchant account is open, and guide it through section A, steps 6 to 10 (by phone if needed). Never ask for its keys.
9. Follow its first real payments in the console (« Feature usage » → cash register) and in **Activity & errors**.

**Plan subscriptions (restaurants paying TIBLOGICS):** the same layer handles the purpose `plan_subscription`. When TIBLOGICS has its own merchant account, the console's « Record a payment » can start an online payment instead of a manual record.

---

## C. Checks and safety (already built)

| Guarantee | How |
|---|---|
| Amount can't be changed by the customer | Computed on the server from the bill |
| No double charge | Idempotency key per attempt; the same webhook twice changes nothing |
| Fake notifications rejected | Signature checked with the business's own credentials; unknown provider/business → refused |
| Lost notifications | Reconciliation every 5 min; abandoned attempts expire after 30 min |
| Credentials safe | AES-256-GCM encrypted, write-only, never sent to a browser or written in logs |
| Only the right customer | A phone can only pay its own order or its own table's bill |
| Everything traced | Every state change in the audit log |
