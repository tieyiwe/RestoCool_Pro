# 5. SOP: platform administration (console)

For the TIBLOGICS / RestoCool team. The console is at `restocool.com/admin_pro`. It is English by default, with a FR switch at the top.

**Access:**

- **Owners of the console:** the emails in the `SUPERADMIN_EMAILS` secret. They have every right.
- **Collaborators:** added in **Team** with a role (Manager, Support, Sales, Analyst, Custom). They only see the pages their rights allow.
- **Everyone else:** sees a plain « page not found ».

Every action in the console is recorded with the person's email (Team → Activity log).

---

## 1. Daily routine (10 minutes)

1. **Overview:**
   - new businesses, orders today, open errors;
   - « Plans ending within 14 days »;
   - « Feature usage » (cash register, reservations, shared selections, tables, reviews).
   - **Online payments** (🌐): encryption key in place, providers, businesses that connected one, failed attempts and bad webhook signatures.
2. **Support:**
   - answer « Blocking » requests first, then the oldest;
   - target: first answer within 2 hours in opening hours.
3. **Deletions:** handle any pending deletion request (section 6).
4. **Activity & errors:** look at new error groups; mark them resolved once understood. If a console figure shows 0 where you expect more, look here for `admin_feature_usage_failed` or `admin_payments_failed`: one figure failed (often a database change not applied at publish) and the rest of the console kept working.
5. **Live:** during lunch and dinner, check « orders waiting » and « late > 15 min ». A business with many late orders may need a call.

## 2. Support requests

**Where requests come from:**

- 🛟 « Aide et signalement » in the app (with the screen the person was on);
- the public page `/aide`, for people locked out.

**Steps:**

1. Open the request. Read the business, person, role and screen.
2. Reply in the conversation and set the status:
   - « In progress »;
   - « Waiting for the business »;
   - « Resolved ».
   The business sees the answer in the 🔔 bell.
3. Assign it to yourself or a colleague.
4. Blocking requests are also emailed to the console owners (when SMTP is set).
5. **Never** ask for a password or a PIN. For account access problems, use section 3.

## 3. Account recovery (locked-out owner or staff)

**Recovery** page, or from a request or a business page.

1. Find the business by **numéro RC**.
2. Ask the caller and **type what they say**. The records are never shown on this page.
3. Fill in:
   - business name;
   - town;
   - a phone of the business or its team;
   - owner name/email;
   - or tick « I called back a known number ».
4. Verified = RC matches + at least 3 items. The case then allows actions for 30 minutes, for you only.
5. Possible actions:
   - **Unlock PIN** (after 5 wrong tries).
   - **New 6-digit PIN:** it is shown once. Tell it by phone; never send it in writing or put it in a link. It ends that person's tablet sessions.
   - **Lift the sign-in lock** of an account.
   - **Hand the business to a new owner email.** The first sign-in with that verified email becomes owner, and the old owner account is switched off (kept for history).
6. Passwords: the person uses « Mot de passe oublié » on the sign-in page. The team never sees passwords.

## 4. Plans and payments

Until online payment exists, the business pays by Orange Money, Moov Money or cash. The team activates the plan by hand.

**Steps:**

1. Receive the payment and note the reference (Orange Money / Moov transaction ID, or « cash » + receipt number).
2. **Businesses** → the business → « Record a payment »:
   - plan (Pro / Business);
   - amount in FCFA;
   - method and reference;
   - number of months.
   The plan becomes active, and its end moves forward from today or from the current end, whichever is later.
3. Tell the owner on WhatsApp: plan, end date, thank you.
4. Manual changes (plan, status, end date) are for corrections only. Write a note on the business page explaining why.

**Plan states:**

| State | Meaning |
|---|---|
| Trial | The 30-day Pro trial; it never ends while the launch offer is on |
| Active | Paid plan running |
| Past due | 7-day grace, with a banner shown in the app |
| Suspended | Menu still visible, ordering off |

No data is ever deleted.

**Launch offer:** Settings → « Launch offer » on/off. Turn it off **only** the day plans can be paid and the owners have been told (send a Message first, section 7).

**Suspend / reactivate:** always with a reason. Reactivating restores what the plan says.

**A business wants its customers to pay online** (its own Orange Money / Moov / aggregator): follow [Connecting mobile money](08-connecting-mobile-money.md), section B. Never ask for its API keys: the owner types them in Paramètres → « Paiements ».

**Online payments page** (🌐, needs « billing.read »):

- the encryption key status (`PAYMENT_ENCRYPTION_KEY`);
- each provider: « Connector ready » or « Connector not written yet », and how many businesses saved / switched on / went live;
- the businesses that connected a provider (mode, on/off, credentials saved or not: the credentials themselves are never shown);
- the latest attempts (paid, waiting, failed, expired, with the error);
- the provider notifications (webhooks), with bad signatures in red.

Each business page has the same « Online payments » section for that business.

## 5. Publishing, featuring, marketing

- **Publish / unpublish** a business from its page (for example a test business left online by mistake).
- **« À la une »:** up to 3 featured businesses on the home page and the directory (rank 1–3), set on the Marketing page.
- **Marketing campaigns:**
  - home page card;
  - home strip;
  - a small « Sponsorisé » banner on free menus.
  Each has a title and text in FR/EN, dates, a theme, and views/taps/CTR. Pause a campaign the day it ends if dates were wrong.
- **Business offers:** the Marketing page lists every business's promotions. Pause any that are misleading or offensive, and tell the owner why.

## 6. Business deletion requests

The owner asks from Paramètres → « Zone de danger ». It becomes effective 72 hours later at the earliest.

**Steps:**

1. **Deletions** page: read the reason.
2. **Call the owner** (contact on the request). Understand why, and solve the problem if it is a problem. Click « Owner contacted » and add a note.
3. Then:
   - **Confirm:** the deletion runs when the 72 hours are over;
   - **or Refuse / close:** for example, the owner changed their mind.
4. After deletion, the business is offline but intact for 10 days. The owner or the console can **Restore** it. After 10 days it is removed for good.

## 7. Messages to businesses

**Messages** page:

1. Type: new feature, news, maintenance, subscription, personal.
2. Title and text in French (EN/ZH optional), optional link.
3. Who sees it in each business: owners, owners + managers, or the whole team.
4. Targeting: plans, kinds, towns, numéros RC. Empty = everyone.
5. Optional pop-up (new features) and optional email to owners.
6. Set an expiry. « Withdraw » stops it at once.

Always send a message **before**:

- maintenance;
- a price or plan change;
- turning off the launch offer.

## 8. Reviews

**Reviews** page:

- See every review, including those businesses hid or deleted (nothing is ever erased).
- Watch 1–2★ reviews that were hidden or deleted. A business deleting many bad reviews may have a service problem worth a call.
- Each business page has a « Customer reviews » section.

## 9. Team (console collaborators)

- **Team** → add a person by email with a role. They receive an EN+FR invitation with links to create their account or sign in. If the email could not be sent, copy the links and send them yourself.
- Give the smallest role that does the job:

  | Role | Rights |
  |---|---|
  | Support | Support + recovery |
  | Sales | Billing + businesses |
  | Analyst | Read only |

- Only console owners give the « Super admin » role. Nobody edits their own access.
- Remove access the day someone leaves the team.

## 10. Releasing a new version (technical owner)

1. Code is pushed to `main` on GitHub after the tests pass.
2. In Replit, open the Shell and run:

   ```bash
   git pull
   ```

   Then click **Republish**. Accept only **additive** database changes (new tables or columns). Never accept a change that deletes data.
3. On start, the platform:
   - backs up the database (last 14 kept);
   - applies the migrations;
   - checks every table;
   - starts.
   If a migration fails, the previous version keeps running.
4. After publishing:
   - open `restocool.com`, a business page and `/app`;
   - check **Activity & errors** for new errors.
   Phones and tablets update themselves; owners on a computer get « Nouvelle version disponible ».
5. Restore a backup only in an emergency: see [`docs/BACKUP.md`](../BACKUP.md).

## 11. Secrets (Replit → Secrets)

| Secret | What it is | Notes |
|---|---|---|
| `APP_URL` | `https://restocool.com` | Used in emails and QR codes |
| `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Sign-in service | |
| `SESSION_SECRET` | Signs private links (reservations) | **Never change it**: links already sent would stop working |
| `SMTP_PASS` | Password of the info@restocool.com mailbox (Titan) | Without it no email is sent |
| `SUPERADMIN_EMAILS` | Console owners, comma separated | |
| `PAYMENT_ENCRYPTION_KEY` | 32 random bytes (64 hex characters) that encrypt businesses' online payment credentials | Needed before any online payment provider is connected. **Never change it** once credentials are saved |
| `SHANGRILA_OWNER_EMAIL` | Optional: Shangri-La's owner email | See [onboarding SOP](03-sop-onboarding-a-business.md), section H |

Never paste a secret in a chat, an email or a document.
