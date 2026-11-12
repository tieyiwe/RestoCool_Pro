# MASTER PROMPT: RestoCool, the multi-restaurant digital menu, ordering and management platform

> Paste this whole file into Claude Code at the start of the project (or save it as `CLAUDE.md` at the repo root).
> Build it milestone by milestone. After each milestone: run the tests, show me the result, and wait for my "go" before starting the next one.

---

## 0. Who you are and how to work

You are a senior full-stack engineer and product designer building a production SaaS for restaurants in **Burkina Faso** (Ouagadougou first, then Bobo-Dioulasso and the rest of West Africa). You build efficiently, at the lowest possible running cost, with code that a small team can maintain.

Working rules:
- Work in **milestones** (section 14). Keep each one shippable. Don't start the next milestone until I approve.
- Before writing code for a milestone, post a short plan: files you'll create, tables you'll change, and the risks you see.
- Prefer boring, proven tools. **No paid third-party service** except Clerk (auth) and Replit itself. If something would need a paid service, build a free alternative or leave a clean extension point and tell me.
- Every database query must be scoped to the current restaurant (tenant). Treat a cross-tenant data leak as a critical bug.
- Write in TypeScript (strict). No `any` unless justified in a comment.
- All user-facing text goes through i18n (French default, English, Chinese). Never hardcode UI strings.
- Mobile first. Test every screen at 360px, 390px, 768px (tablet), 1024px and 1440px.
- Ask me before making a decision that is hard to undo (schema shape, auth model, pricing logic).

---

## 1. Product summary

**Brand:** **RestoCool** (written "RestoCool", logo in two parts: **Resto** + **Cool**). A product of **TIBLOGICS**.
**Domains:** main site **restocool.com**. **restaucool.com** redirects to it (301) to catch the other spelling. **restofaso.com** is reserved for Burkina campaigns and also redirects for now.
**Tagline (FR):** « RestoCool : votre menu, vos commandes, vos tables. Simple. »
**URL scheme:** public menus at `restocool.com/r/{slug}` (short and printable on QR cards), staff and owner app at `restocool.com/app`, super admin at `restocool.com/admin_pro`, marketing landing page at `restocool.com`.
**Brand tone:** warm, simple, modern, and proud to be from Burkina. French first. Never sounds expensive or exclusive, since small maquis and big restaurants both belong.
**"100 % local" positioning (core of the brand):** Burkina Faso is actively promoting local products and local solutions (« consommons local »). RestoCool must clearly read as **a solution made for Burkina, by and for Burkinabè businesses**, not an imported foreign app.
- **Taglines and badges to use** (FR first, with EN versions):
  - « **100 % local** » badge (green, with a discreet Burkina-inspired accent) on the landing page, the sign-up page and the app's "About" screen.
  - « Pensé au Burkina, pour les restaurants du Burkina » / "Designed in Burkina, for Burkina's restaurants".
  - « Fièrement burkinabè » / "Proudly Burkinabè".
  - « Payez en FCFA, avec Orange Money et Moov Money » / "Pay in FCFA, with Orange Money and Moov Money".
  - « Support en français, par WhatsApp » / "Support in French, by WhatsApp".
- **Show it, don't just say it:** FCFA everywhere, +226 numbers, Orange Money and Moov logos (text names until logo use is approved), local cities in examples (Ouagadougou, Bobo-Dioulasso, Koudougou), local dishes in the demo restaurant (riz gras, tô, poulet bicyclette, brochettes, jus de bissap, jus de gingembre), photos and illustrations of local settings (maquis, terrasses), and Mooré/Dioula greetings in the UI (« Laafi », « Barka ») next to French.
- **Optional badge for restaurants:** owners can show a « Restaurant 100 % local » or « Produits locaux » tag on dishes or on their menu (for example "made with local shea butter, local chicken, local bissap"), with a filter for customers.
- **Visual identity:** draw on Burkina's colors (red, green, yellow star) as **accents only**, without copying the national flag or coat of arms, and inspired by Faso Dan Fani woven patterns as a subtle texture. Never use official state symbols in the logo.
- **Honesty rule (mandatory):** every "local" claim must be true. Don't claim local hosting (servers are on Replit, outside Burkina) or a local office/team unless I confirm it. Before writing the landing page, ask me to confirm which of these are true: founder is Burkinabè, team or support people based in Burkina, registered company in Burkina, local partners. Use only the confirmed ones.

**Brand identity to create in M1:** a simple logo (SVG, works at 32px for the favicon and app icon), a primary color, and a neutral palette. Each restaurant's own branding always comes first on its public menu, and RestoCool only appears in the footer badge.


A platform where **any restaurant** can sign up, create its profile, build its menu with photos, print QR codes, and run its dining room from a phone or tablet:

- **Customers** scan a QR code, browse the menu in French, English or Chinese, add dishes, and send the order to the restaurant. They never need an account or an app.
- **Staff** (servers, kitchen, cashier) receive orders live, confirm them, prepare them, serve them, and mark them paid.
- **Owners and managers** manage the menu, tables/areas, staff profiles, reservations, opening hours, and see sales statistics.
- **TIBLOGICS (super admin)** manages restaurants, plans and billing for the whole platform.

It's an independent, new product. It reuses the ideas of a single-restaurant prototype we built earlier, but shares no code, data or branding with it. The features listed in section 5 must all exist in the platform as per-restaurant options.

**Market facts to design for:**
- Currency: **FCFA (XOF)**, no decimals, displayed as `5 300 F` (narrow space as thousands separator, "F" suffix).
- Timezone: `Africa/Ouagadougou` (UTC+0, no daylight saving).
- Phones: `+226` followed by 8 digits, displayed `+226 77 29 98 78`.
- Payments are mostly **cash, Orange Money and Moov Money**, confirmed by hand.
- **WhatsApp** is the main communication channel. Use free click-to-chat links (`https://wa.me/<number>?text=...`), not a paid WhatsApp API.
- Networks can be slow or unstable, and many customers have entry-level Android phones with limited data. Pages must be light, fast and usable offline after the first visit.
- Many staff don't have an email address. Staff login must work without one (section 6).
- Not every restaurant has numbered tables or private rooms. The seating model must be flexible (section 7).

---

## 2. Tech stack (fixed)

| Concern | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 (App Router) + React 19 + TypeScript** | One codebase for pages and API. Easy to wrap with Capacitor later for Play Store and App Store. |
| Styling | **Tailwind CSS + shadcn/ui** (Radix) | Accessible components, fast to build, small CSS. |
| Database | **Replit PostgreSQL** | Included with Replit, no extra service. |
| ORM | **Drizzle ORM + drizzle-kit migrations** | Light, typed, SQL-first. |
| Auth | **Clerk** (Organizations enabled) | Owners and managers. One Clerk Organization = one restaurant. Free tier is enough to start. |
| Staff auth | **Own PIN login on authorized devices** (section 6) | Staff without email. No extra Clerk cost per server. |
| Realtime | **Server-Sent Events (SSE)** from Next.js route handlers, fed by **Postgres LISTEN/NOTIFY**, with a 4-second polling fallback | Free, works across instances, no Pusher/Ably. |
| Files and images | **Replit Object Storage** | Included. Images are compressed to WebP in the browser before upload. |
| Validation | **Zod** (shared between client and server) | |
| Forms | **react-hook-form** | |
| i18n | **next-intl** | FR (default), EN, ZH. |
| QR codes | `qrcode` (npm), generated server side as SVG/PNG | Free. |
| PDF (QR table cards, receipts) | `@react-pdf/renderer` or `pdf-lib` | Free, server side. |
| Offline / PWA | Custom service worker (Workbox optional) + Web App Manifest | Installable, offline menu. |
| Charts | `recharts` | Owner dashboard. |
| Testing | **Vitest** (unit), **Playwright** (end-to-end, mobile viewports) | |
| Deploy | **Replit Deployments** | One Repl. Use the deployment type that keeps one long-lived server process (Reserved VM) so SSE and LISTEN/NOTIFY are reliable. Tell me the expected monthly cost before deploying. |

Environment variables (store them in Replit Secrets, never in code): `DATABASE_URL`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SECRET`, `APP_URL`, `SESSION_SECRET` (signing staff PIN sessions and QR tokens), `SUPERADMIN_EMAILS` (comma separated), `PAYMENT_ENCRYPTION_KEY` (32-byte key that encrypts payment provider credentials).

---

## 3. Users and roles

| Role | How they log in | Can do |
|---|---|---|
| **Customer** | No login. Anonymous device ID (random, stored in localStorage) | Browse menu, order, track order, reserve, view own history on that device |
| **Server (serveur)** | PIN on an authorized device, or Clerk if they have an email | See assigned tables/areas, confirm orders, mark served, take orders for customers, call for payment |
| **Kitchen (cuisine)** | PIN on the kitchen tablet | Kitchen display: see items to prepare, mark preparing/ready |
| **Cashier (caisse)** | PIN | Bills, mark paid (method + reference), split bill, print/share receipt |
| **Manager** | Clerk | Everything staff can do, plus menu, tables, staff, shifts, reservations, reports for their restaurant |
| **Owner** | Clerk | Everything a manager can do, plus restaurant settings, plan, branches, add/remove managers |
| **Super admin (TIBLOGICS)** | Clerk, email in `SUPERADMIN_EMAILS` | All restaurants, plans, activation, impersonation in read-only mode, platform stats |

Permissions are enforced on the **server** for every request (route handlers and server actions), never only in the UI. Write one `can(user, action, resource)` helper and unit-test it.

---

## 4. Plans (billing-ready, payments confirmed by hand)

Restaurants pay TIBLOGICS by Orange Money or cash. The super admin activates or extends a plan by hand in v1. Plan payments go through the payment layer in section 8b (purpose `plan_subscription`), so they can become automatic as soon as a payment provider is connected.

| | **Gratuit** | **Pro** | **Business** |
|---|---|---|---|
| Suggested price | 0 F | ~10 000 F / month | ~25 000 F / month |
| Digital menu + photos + 3 languages | ✅ | ✅ | ✅ |
| QR codes + printable table cards | ✅ (1 generic QR) | ✅ per table/area | ✅ |
| Menu items | up to 40 | unlimited | unlimited |
| Customer ordering + live order tracking | ❌ (menu only, WhatsApp takeaway link) | ✅ | ✅ |
| Staff profiles + PIN devices | ❌ | up to 10 | unlimited |
| Kitchen display + front desk dashboard | ❌ | ✅ | ✅ |
| Reservations | ❌ | ✅ | ✅ |
| Reports and CSV export | basic views count | ✅ | ✅ + staff performance |
| Multiple branches | ❌ | ❌ | ✅ |
| RestoCool / TIBLOGICS footer badge | always | always | can be hidden |

Store plan limits in **one config file** (`/src/config/plans.ts`) and check them in a single `assertPlan(restaurant, feature)` helper. Prices are placeholders: I'll confirm them.

Plan states: `trial` (30 days of Pro on signup), `active`, `past_due` (7-day grace, banner shown), `suspended` (menu stays visible, ordering disabled). Never delete data when a plan lapses.

---

## 5. Features carried over from the prototype (all must exist)

Each one is a per-restaurant toggle in Settings unless noted.

1. **Public menu page** at `/{locale}/r/{restaurantSlug}`, with categories as a sticky horizontal tab bar, search (works across all three languages), a "spicy" filter, numbered items, "new" badges, and prices formatted in FCFA.
2. **Dish photos**: thumbnail in the list (168px, lazy-loaded), tap to enlarge, swipe left/right between photos, swipe down to close.
3. **Three languages**: French by default **on every new visit**. The choice only lasts for the current visit (sessionStorage). Each dish shows the original name underneath in the other languages (for example the Chinese name under the French one), so staff can read any order. Owners can type translations or click **"Suggérer"** to prefill from a built-in glossary (no paid AI in v1).
4. **Welcome screen** with confetti and "Bienvenue au {restaurant}" (FR/EN/ZH). It closes by itself after about 3 seconds. Respect `prefers-reduced-motion`.
5. **Share button** always visible in the sticky bar: native share sheet, falling back to WhatsApp, Facebook and Copy link.
6. **Contact section**: phone numbers (tap to call), WhatsApp button and QR, Orange Money number, address with a Google Maps link, opening hours with "Open now / Closed".
7. **"Ma sélection" (cart)**: **+** on every item, quantity steppers, running total in a bottom bar. Items with **variants** (for example Champagne 48 000 F / 78 000 F, half or full portion) open a chooser. Items with no price show "Sur demande" and never "0 F".
8. **Seating choice required** before an order can be sent (section 7).
9. **"Montrer au serveur"**: a full-screen, high-contrast order view with a large seating badge and an order QR code the server can scan.
10. **Order tracking for the customer**: live status (sent, confirmed, preparing, ready, served, paid). When served: confetti and "Vous avez été servi ! Bon appétit".
11. **History on the device**: a new visit starts an empty cart. The previous cart and past orders go to "Sélections précédentes", where they can be reused or deleted.
12. **Takeaway by WhatsApp**: name and pickup time, prefilled French message with item numbers and total, sent to the restaurant's WhatsApp.
13. **Fortune cookie** (24+ fortunes, FR/EN/ZH, shareable). Owners can edit or disable them.
14. **Offline**: menu and thumbnails cached after the first visit. The page is installable as an app, and updates itself when a new version is deployed (check on load and when the tab becomes visible).
15. **Mobile polish**: 44px minimum tap targets, 16px inputs (no iOS zoom), safe-area insets, the phone's back button closes panels, a back-to-top button, and visible focus states.
16. **Inactivity release** for seat-picker mode (section 7.3).
17. **Footer badge** on every public menu: « Menu par **RestoCool** · Powered by **TIBLOGICS** », linking to restocool.com (sign-up page for other restaurants, which makes every menu a free ad) and tiblogics.com.

**Architecture note:** orders, sessions and statuses always go through the **database + SSE**. Orders are stored, staff see them live on any device, and nothing depends on an external relay or on passing data between phones by QR code.

---

## 6. Staff accounts without email (important)

- Owner or manager creates staff profiles: name, photo (optional), role (server, kitchen, cashier), phone, a **4 to 6 digit PIN** (hashed with argon2/bcrypt), assigned areas, and active/inactive status.
- **Authorized devices**: a manager signs in with Clerk on a tablet or phone and taps **"Autoriser cet appareil"**. That creates a long-lived, signed device token for that restaurant (http-only cookie, revocable from Settings → Appareils).
- On an authorized device, staff see a **PIN pad with their faces/names** and log in with their PIN. Staff sessions expire after a shift (configurable, default 12h), plus an auto-lock after X minutes idle.
- 5 wrong PINs lock that staff profile for 10 minutes. Log every login in an audit table.
- Staff who do have an email can also be invited through Clerk instead.
- Every action (confirm, serve, mark paid, cancel, discount) records **who did it and when**.

---

## 7. Flexible seating model (not every restaurant has numbered tables)

### 7.1 Restaurant chooses its mode in the onboarding wizard
- **Numbered tables** (for example 1 to 20, skipping any numbers they don't use)
- **Named areas** (Terrasse, Salle climatisée, Bar, Jardin, VIP)
- **Private rooms** (salons, for example 201, 601, "Salon Ouaga")
- **Counter / no seating**: customer gives a **first name**, and the order gets a short **pickup number** (for example A-27)
- **Takeaway** and **Delivery** (address + phone, delivered by the restaurant's own rider, manual)

A restaurant can combine several (for example tables + private rooms + takeaway). Each seating unit has a type, a label, an optional area, a capacity, and an active flag.

### 7.2 Two QR strategies (restaurant picks)
1. **One QR per table/room (recommended)**: the QR holds an unguessable token for that seat. Scanning it sets the seat automatically, so there's no picker and no collisions.
2. **One generic QR** for the whole restaurant: the customer picks their seat from a picker with distinctive designs (gold round coin for tables, red lacquer plate for rooms, green tag for takeaway).

### 7.3 Table sessions and collisions
- The first scan or order at a seat opens a **table session**. Other phones scanning the same table **join the same session**: they see the shared table bill, and each phone can add its own items (group ordering). The session closes when it's paid, or when a server closes it.
- In picker mode, when a customer picks a seat that has an open session from another device, warn them: "Cette table est déjà occupée. Vérifiez votre numéro, ou rejoignez la table si vous êtes ensemble." They can choose **Rejoindre** or **Choisir une autre**.
- **Inactivity release** (picker mode, before any order is sent): after 4 minutes with no activity, show "Êtes-vous toujours là ?" with a 30-second countdown. With no answer, release the seat. It must also work when the screen turned off: evaluate on `visibilitychange`, and don't count the wake-up touch as activity. Make both timings configurable.
- The server and front desk always see the **seat badge** in large, distinctive styling on every order card.

---

## 8. Orders and service

**Statuses:** `draft` (customer cart, client side only) → `sent` → `confirmed` → `preparing` → `ready` → `served` → `paid` (or `cancelled` with a reason, at any step before paid).

**Setting "Validation des commandes"** (per restaurant):
- **Direct**: `sent` orders go straight to the kitchen display.
- **Server confirms first**: `sent` orders appear for the assigned server, who confirms them (and can edit them with the customer) before they reach the kitchen.

**Screens:**
- **Front desk dashboard** (tablet/desktop): live board of all open orders by status, filters by area/server, sound + vibration on new orders, seat badges, elapsed timers that turn orange and red after configurable delays.
- **Kitchen display (KDS)**: large cards per order, items grouped, tap an item or the whole order to mark preparing/ready, optional per-station filter (grill / wok / drinks / desserts). Each menu item has a station.
- **Server app** (phone): "My tables" with open sessions, new orders to confirm, ready orders to serve, payment requests. Servers can also **take an order for a customer** from the staff menu.
- **Customer tracking**: live status on the customer's phone through SSE, falling back to polling.

**Order details:** per-item notes ("sans piment"), variants/options with price deltas, quantity, who added it (device or staff), timestamps for every status, and a printable or shareable **ticket** (PDF and WhatsApp text).

**Assignment:** servers are assigned to areas or tables per shift. A new order goes to the server of that seat, or to a pool if nobody is assigned. A manager can reassign.

**Payments (manual in v1):** cashier or server marks an order or session **paid** with: method (`cash`, `orange_money`, `moov_money`, `card`, `other`), amount received, change given (cash), transaction reference (mobile money), and optional discount with a reason (manager approval above a threshold). It supports **split bill** (by item or by equal parts). Show the restaurant's Orange Money and Moov numbers to the customer with a "copy" button. Every payment, manual or online, goes through the payment layer in **section 8b**, so online payment can be switched on later without changing order logic.

**Daily closing (clôture de caisse):** totals by payment method, by server and by category, cancelled orders, discounts. Exportable as PDF or CSV.

---

## 8b. Payment layer: build the plumbing now, plug a payment API in later

Online payment (Orange Money, Moov Money, cards, through an aggregator like CinetPay, PayDunya or Ligdicash, or an operator API directly) will be added later. **Build the full structure now** so that adding a provider means writing one adapter file and adding credentials, with no change to orders, sessions, reservations or plans.

**1. One provider interface** (`/src/payments/types.ts`):
```ts
interface PaymentProvider {
  id: ProviderId;                        // "manual" | "cinetpay" | "paydunya" | "ligdicash" | "orange_money" | "moov_money" | ...
  supports: { methods: PaymentMethod[]; refunds: boolean; currency: "XOF" };
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;  // returns redirect URL, USSD code, or "pending"
  getStatus(providerRef: string): Promise<ProviderStatus>;
  verifyWebhook(req: Request, rawBody: string): Promise<VerifiedEvent | null>; // signature check, returns null if invalid
  refund?(providerRef: string, amount: number): Promise<RefundResult>;
}
```
- Implement **`manual`** fully (it's what staff use in v1: it records method, reference and amount and succeeds immediately).
- Create **stub adapters** for `cinetpay`, `paydunya`, `ligdicash`, `orange_money`, `moov_money`. They throw `ProviderNotConfiguredError`, contain TODO notes with the steps to implement them, and are covered by the same contract tests as `manual`.
- A **registry** (`/src/payments/registry.ts`) returns the provider configured for a restaurant.

**2. Tables:**
- `payment_intents` (id, restaurant_id, purpose: `order` | `session` | `reservation_deposit` | `plan_subscription`, purpose_id, amount, currency `XOF`, provider, method, status: `created` → `pending` → `succeeded` | `failed` | `cancelled` | `expired` | `refunded`, provider_ref, idempotency_key unique, customer_phone, return_url, metadata jsonb, expires_at, created_by)
- `payment_webhook_events` (provider, provider_event_id unique, payload jsonb, signature_valid, received_at, processed_at, error)
- `payment_provider_configs` (restaurant_id, provider, enabled, mode `test` | `live`, credentials **encrypted** with AES-256-GCM using `PAYMENT_ENCRYPTION_KEY` from Replit Secrets, fee_percent, fee_fixed). Credentials are never sent to the browser or written to logs.
- The existing `payments` table records the **settled** money and links to `payment_intent_id`.

**3. Flow and guarantees:**
- One service, `paymentService.start(purpose, purposeId, method)`, creates the intent with an idempotency key, calls the provider, and returns what the UI needs (redirect URL, USSD instructions, or "waiting").
- Webhook route `POST /api/webhooks/payments/[provider]`: read the raw body, verify the signature, store the event (dedupe on `provider_event_id`), and process it in a transaction. It's **idempotent**: the same event twice changes nothing.
- A **reconciliation job** (route triggered by a scheduler, or every 5 minutes while the server runs) checks `pending` intents older than 2 minutes with `getStatus()` and expires abandoned ones.
- When an intent succeeds, the order/session/reservation/plan updates through the same domain events as manual payment, and emits the same `NOTIFY` for SSE, so the customer and staff screens update live.
- Amounts are always computed **on the server** from the order, never trusted from the client.
- Log every state change in `audit_log`.

**4. UI hooks (hidden until a provider is enabled):**
- Customer: a **"Payer maintenant"** button on the bill and the order tracking screen, a payment status screen (waiting / paid / failed + retry), and a "pay deposit" step on reservation requests.
- Owner: **Settings → Paiements en ligne** with a provider list, test/live mode, a credentials form (write-only), and a "test connection" button.
- Super admin: the same layer handles **plan subscriptions** (restaurants paying TIBLOGICS), so plan activation can become automatic.

---

## 9. Reservations

- **Public form** on the restaurant page: date, time slot, party size, seating preference (area or private room), occasion (birthday, business, other), name, phone/WhatsApp, note.
- Owner sets **opening hours, slot length, maximum covers per slot**, and which rooms can be reserved, with an optional manual **deposit** for private rooms (paid by Orange Money, confirmed by hand).
- Statuses: `requested` → `confirmed` / `declined` → `seated` → `completed` / `no_show` / `cancelled`.
- **Manager calendar** (day and week views), color-coded by room/area, with a conflict warning when a room is double-booked.
- Confirmations and reminders go out as **prefilled WhatsApp messages** (the manager taps "Envoyer sur WhatsApp"). No SMS API. The customer can also get an `.ics` calendar file.
- When a reservation is seated, it opens a table session on the assigned seat.

---

## 10. Menu management

- Categories (ordered, with drag and drop), items with: number/code (optional), names and descriptions in FR/EN/ZH (FR required), price or "sur demande", variants/options, spicy level (0 to 2), tags (new, chef's pick, vegetarian, contains peanuts/shellfish/eggs), station, photo, availability toggle (**"épuisé aujourd'hui"**, resets the next day), and time windows (for example lunch only).
- **Photo upload**: crop, then compress in the browser to WebP (1200px max for the full photo, plus a 168px square thumbnail), then upload to Replit Object Storage. Show a data-size estimate.
- **Bulk tools**: CSV import/export, duplicate item, change prices by percentage for a whole category.
- **Daily special** banner ("Plat du jour") with start and end dates.
- **Branding**: logo, cover photo, accent color (validated for contrast), choice of 3 themes (dark lacquer, light, warm).
- The menu has a public **preview mode** before it's published.

---

## 11. Extra features to make it powerful and cheap (build them in the milestones listed)

1. **Group ordering at one table** (section 7.3): several phones, one shared bill. (M4)
2. **"Épuisé" in one tap** from the kitchen or front desk, shown live to customers. (M4)
3. **Low-data mode**: one toggle loads no photos, for customers on expensive data. (M2)
4. **Printable QR kits**: A4 sheets of table tent cards per seat, with the restaurant logo, in FR/EN/ZH. (M3)
5. **Staff performance**: orders served, average service time, tips (optional field). (M6)
6. **Customer feedback**: after "served", an optional 1 to 5 stars + comment, visible to the manager, with a link to the restaurant's Google review page. (M6)
7. **Loyalty card (simple)**: a stamp every X paid orders on the same device or phone number, and a reward the manager defines. (M7)
8. **Multi-branch**: one owner, several restaurants, consolidated reports. (M7, Business plan)
9. **Local languages ready**: the i18n structure accepts Mooré and Dioula later, with no code change. (structure in M1)
10. **WhatsApp "receipt"**: send the ticket as a prefilled WhatsApp message. (M5)
11. **Offline staff queue**: if the server's phone loses the network, actions queue and sync when it's back, with a visible "en attente de connexion" state. (M5)
12. **Platform analytics for TIBLOGICS**: active restaurants, orders per day, plan revenue, churn. (M7)

---

## 12. Data model (Drizzle, Postgres)

Every tenant table has `restaurant_id` (uuid, indexed) plus `created_at` and `updated_at`. Use uuid primary keys. Store money as **integer FCFA**. Store translations as JSONB `{ fr, en?, zh? }`.

- `restaurants` (id, clerk_org_id, slug unique, name, legal_name, logo_url, cover_url, theme, accent_color, phones[], whatsapp, orange_money, moov_money, address, city, gmaps_url, timezone, default_locale, settings jsonb, plan, plan_status, plan_expires_at, published, powered_badge)
- `branches` (if multi-branch: or model a branch as a restaurant with `parent_restaurant_id`; recommend one and justify)
- `opening_hours` (restaurant_id, weekday, opens, closes)
- `areas` (name i18n, sort)
- `seats` (type: table | room | area | counter | takeaway | delivery, label, area_id, capacity, qr_token unique, active, sort)
- `menu_categories` (name i18n, sort, active, time_window)
- `menu_items` (category_id, code, name i18n, description i18n, price nullable, spicy, tags[], station, photo_url, thumb_url, available, sold_out_until, sort)
- `menu_item_variants` (item_id, name i18n, price)
- `menu_item_options` (item_id, group, name i18n, price_delta, max_select)
- `staff` (name, photo_url, role, phone, pin_hash, clerk_user_id nullable, active, locked_until)
- `devices` (name, token_hash, authorized_by, last_seen_at, revoked_at)
- `shifts` and `assignments` (staff_id, seat_id or area_id, starts_at, ends_at)
- `table_sessions` (seat_id, opened_at, closed_at, opened_by_device, status)
- `orders` (session_id, seat_id, number per day, source: customer | staff, customer_device_id, customer_name, customer_phone, status, validation_mode, assigned_staff_id, totals, notes, timestamps per status, cancelled_reason)
- `order_items` (order_id, item_id, variant_id, options jsonb, name_snapshot i18n, unit_price_snapshot, qty, note, station, status)
- `payments` (session_id or order_id, method, amount, change_given, reference, discount, discount_reason, staff_id)
- `reservations` (seat_id or area_id preference, date, time, party_size, occasion, name, phone, note, deposit, status, staff_id)
- `feedback` (order_id, rating, comment)
- `loyalty_cards`, `loyalty_stamps`
- `fortunes` (text i18n, active)
- `audit_log` (actor_type, actor_id, action, entity, entity_id, data jsonb, ip, created_at)
- `plan_events` (restaurant_id, from, to, amount, method, reference, by_superadmin)

Add a Postgres **trigger or app-level hook** that runs `NOTIFY restaurant_<id>` with a small JSON payload on order, session and reservation changes, for the SSE stream.

---

## 13. Architecture, security and performance requirements

- **Tenant isolation**: all data access goes through a repository layer that requires a `restaurantId` from the authenticated context (Clerk org, staff session, or seat QR token). Add a Playwright test that tries to read another restaurant's orders and expects a 403/404.
- **Public endpoints** (menu, ordering, reservations, tracking) have rate limiting (in-memory token bucket per IP + device ID) and Zod validation, and take only the fields they need.
- **QR tokens and device tokens** are random (≥ 128 bits). Store them hashed when they grant staff access.
- **SSE**: one stream per restaurant per role (`/api/stream?scope=frontdesk|kitchen|server|order:<id>`), with a heartbeat every 25s and automatic reconnect. The customer stream only receives their own order and session events.
- **Performance budget for the public menu**: under 150 KB of JS on first load, under 600 KB total with thumbnails, Largest Contentful Paint under 2.5s on a mid-range Android with a 3G profile. Server-render the menu, stream images, and use `next/image` with WebP and a custom loader for Object Storage.
- **PWA**: separate service worker scopes for the public menu (`/r/...`) and the staff app (`/app/...`). Network-first for HTML, cache-first for images, versioned caches, update on deploy.
- **Accessibility**: WCAG 2.1 AA contrast, keyboard navigation, visible focus, labels on every control, `prefers-reduced-motion` respected.
- **Responsive**: phone (360 to 430px), tablet portrait and landscape (768 to 1180px: the front desk and kitchen layouts are designed for tablets first), and desktop. Kitchen and front desk screens support "always on" kiosk usage (Wake Lock API where available).
- **Backups**: a daily `pg_dump` script and documentation on how to restore it.
- **Observability**: structured logs, an `/api/health` endpoint, and a super admin error list (no paid monitoring).
- **Mobile apps later**: keep all business logic in API routes and server actions (no logic only in components), so a Capacitor shell can reuse the web app. Don't use browser APIs that Capacitor can't provide without a fallback.

---

## 14. Milestones (build in this order)

Each milestone ends with: migrations applied, seed data updated, Vitest and Playwright passing at 390px and 1024px, and a short demo script for me.

**M1: Foundation**
Next.js + Tailwind + shadcn/ui + next-intl (FR/EN/ZH, FR default) + Drizzle + Replit Postgres + Clerk (Organizations). App shell, layouts for public / staff / admin, theming, the `can()` and `assertPlan()` helpers, the audit log, the repository layer with tenant scoping, and the Clerk webhook to create a restaurant on organization creation. **Seed: create a fictional demo restaurant** ("Restaurant Démo", Ouagadougou) that you write yourself: about 40 items across 6 categories in FR/EN/ZH, with variants, spicy levels, a price "sur demande", 10 tables, 2 areas, 3 private rooms, and placeholder images generated locally (no stock photos). Don't use any real restaurant's name, menu or photos.

**M2: Restaurant onboarding and public menu**
Onboarding wizard (name, slug, contacts, hours, seating mode, languages, theme), menu manager (categories, items, variants, photos with in-browser compression, availability), and the full public menu page with features 1 to 7 and 13 to 17 from section 5, plus low-data mode. Publish/unpublish.

**M3: Seating and QR**
Seats/areas/rooms manager, QR per seat and generic QR, printable PDF table cards, the seat picker with distinctive designs, table sessions, collision warning, and inactivity release.

**M4: Ordering and live service**
Customer order submission, validation mode setting, SSE + LISTEN/NOTIFY with a polling fallback, front desk dashboard, kitchen display with stations, customer live tracking, group ordering at one table, and sold-out in one tap.

**M5: Staff and payments**
Staff profiles, authorized devices, PIN login with lockout, shifts and assignments, server app ("my tables"), staff-entered orders, the **payment layer from section 8b** (interface, registry, `manual` provider, stub adapters, payment intents, webhook route, reconciliation job, encrypted provider configs, contract tests), manual payments with methods/split bill/discounts on top of it, receipts (PDF + WhatsApp), daily closing, and the offline action queue.

**M6: Reservations, feedback and reports**
Reservation form and calendar, WhatsApp confirmations, `.ics` files, deposits, seating a reservation, customer feedback, and owner reports (sales by day/hour/category/server, top dishes, average ticket, CSV/PDF export).

**M7: Platform and growth**
Super admin console (restaurants, plans, manual activation, plan events, platform stats, read-only impersonation), plan limits enforced everywhere, trial/grace/suspension states, multi-branch, loyalty card, and the public marketing landing page at **restocool.com** with a « Créer mon restaurant gratuitement » sign-up (FR first, EN second), built around the **"100 % local"** positioning from section 1 (hero: « La solution 100 % locale pour les restaurants du Burkina »).

**M8: Hardening and launch**
Security review (tenant isolation tests, rate limits, token handling), performance pass against the budget, accessibility pass, backup/restore script, a privacy page and terms in French, and production deployment on Replit with the custom domain **restocool.com** (HTTPS), plus 301 redirects from **restaucool.com** and **restofaso.com**.

---

## 15. Definition of done (for every feature)

- Works at 360px, 390px, 768px, 1024px and 1440px, in FR, EN and ZH.
- Works on a slow 3G profile, and degrades gracefully offline.
- Permissions are checked on the server, with tenant isolation tested.
- Every user-facing string is translated. French is reviewed by a native speaker standard (no anglicisms).
- Loading, empty and error states are designed (no blank screens, and errors say what to do).
- Playwright covers the main path.

---

## 16. Out of scope for v1 (leave clean extension points)

Real payment provider integrations (the plumbing from section 8b is in scope, the live adapters are not), SMS, paid WhatsApp Business API, AI translation or menu OCR from photos, native apps (Capacitor comes after M8), delivery-rider app, accounting integrations.

---

## 17. Start now

1. Read this whole document.
2. Ask me any blocking question (maximum 5, multiple choice where possible).
3. Post the M1 plan: folder structure, Drizzle schema for M1 tables, Clerk setup steps I must do in the Clerk dashboard, and Replit Secrets I must add.
4. Wait for my "go".

---

## 18. Decisions taken during the build (these override the sections above)

- **Tenants are app-managed (no Clerk Organizations).** Clerk only proves identity (`clerk_user_id`). Restaurant membership and the RestoCool role (owner, manager, server, kitchen, cashier) live in the `members` table. A signed-in user with no restaurant is sent to `/app/new` to create one; a user in several restaurants switches with the header switcher (active restaurant stored in an http-only cookie and always re-checked against `members`). There is no Clerk webhook and no `CLERK_WEBHOOK_SECRET`. Works with Replit-managed Clerk.
- **Branches** are full restaurants with `parent_restaurant_id`.
- **Public menu URLs have no locale**: `/r/{slug}`, always French on a new visit; the visitor's language lives in sessionStorage. The staff app remembers the language in a cookie.
- **Price display**: `5 300 F` with U+202F narrow spaces (`formatFCFA`).
- **QR kit**: a print-ready A4 page (table tents or 6 cards per page) that the owner prints or saves as PDF from the browser, instead of a server-generated PDF (keeps Chinese text and logos exact, no large font files).
- **Table sessions** open on the first scan of a table QR (or the first pick in the seat picker); idle sessions close by themselves (picker: inactivity timings; QR: after 4 h without activity, until orders exist).
- **Legal pages** live at `/privacy` and `/terms` (French is the reference text, English for convenience; aliases `/confidentialite`, `/conditions`, `/cgu`). Publisher: TIBLOGICS (United States, part of Tilogroup); RestoCool is a TIBLOGICS product; governing law is a US state (to be filled). The privacy policy includes the Google sign-in disclosures (scopes openid/email/profile, use, sharing, deletion, Limited Use). Publisher details are in `src/config/legal.ts`.
- **Photos**: WebP when the browser can encode it, JPEG otherwise (Safari/iPhone); the server checks the real format from the bytes.
- **Dev sign-in bypass** (`DEV_AUTH_BYPASS=1`) only works on localhost and never in production.
- **Local claims confirmed**: the founder is Burkinabè, so « 100 % local », « Fièrement burkinabè » and « Fondé par un Burkinabè » are shown (`src/config/marketing.ts`). Team in Burkina and local partners are not confirmed yet. Never claim local hosting.
- **Prices confirmed**: Gratuit 0 F, Pro 10 000 F / month, Business 25 000 F / month (`src/config/plans.ts`). Each plan's feature list must make the difference between plans clear.
- **Typed codes under every QR**: each QR (the restaurant's main QR and each table/room QR) has a 5-character code (alphabet without 0/O/1/I/L/U/V) in `access_codes`. Customers type it at `restocool.com/c` (or open `restocool.com/c/CODE`) and land on the same page as the scan. Lookups are rate limited per IP; regenerating a seat's QR also replaces its code; an inactive seat's code opens the restaurant menu.
- **New restaurants**: the main QR and its code exist from creation; the setup wizard asks how many tables and creates tables 1..N with their QR; the dashboard shows « Prochaines étapes » and the main QR with print-and-place instructions; stickers carry 2 scan steps (FR/EN/ZH).
- **Live events (M4)**: one Postgres channel `rc_events` for the platform; each payload carries the restaurant id and only ids (order, session, device). One LISTEN connection per server process fans out to SSE streams (`/api/app/stream` for staff, `/api/public/stream` for customers), which forward only that restaurant's events (customers: their own orders, their shared table, menu changes). Screens re-fetch through the permission-checked APIs; polling every 4 s while the stream is down.
- **Orders (M4)**: prices are computed on the server and frozen in `order_items`; numbers restart at 1 each day (UTC = Ouagadougou). « Direct » validation creates orders as `confirmed`. Group bill (shared table) only for table/room seats (areas are shared by unrelated groups, like the counter; `src/lib/seating/group-seats.ts`); counter/takeaway/delivery customers only see their own orders. Sessions with orders in progress never auto-close. `paid` arrives with payments in M5; until then the front desk and kitchen are used by Clerk members (owner/manager/server/kitchen roles), PIN devices come in M5. The « Montrer au serveur » QR opens `/app/orders/{id}` (members of that restaurant only).
- **Business first**: until a signed-in user has a restaurant and its owner has finished the setup wizard, the app is in focus mode (no navigation; every page redirects to `/app/new` or the wizard). The wizard has 6 named steps (creation + profile, contacts, hours, service & tables, branding); reaching the end unlocks the app.
- **Personnel matricule**: every member has `staff_no` (unique per restaurant, never reused, shown as 001). Orders record `confirmed_by`, `prepared_by`, `served_by`, `cancelled_by` (and `taken_by` for staff-entered orders, M5); the front desk shows « Confirmée par Awa · matricule 002 ». Owners and managers see order and personnel analytics on the dashboard (reports.read).
- **Numéro RC**: the 5-character codes are shown with the RestoCool prefix, « RC-K7M3P »; typing it with or without « RC » works.
- **Directory** at `/restaurants`: published restaurants only, searchable as you type by name, city (accents ignored) or numéro RC (full code, or « RC-K7… » prefix). `restaurants.featured_rank` (1–3) puts restaurants « À la une » on the home page and directory; the platform admin will set it (M7). The demo is featured in seed data.
- **Pointage (check-in/out)**: `attendance` table (one open row per person). Personnel check in and out with matricule + PIN on `/pointage/<token>` (the check-in QR the owner prints for the staff entrance; the token is regenerable) or on `/pointage` with the restaurant's numéro RC. The same code toggles arrival/departure. 5 wrong PINs lock the profile 10 minutes. Owners/managers can check anyone in or out by hand (method « manager », recorded with who did it). Feature flag `features.attendance`, ON by default, can be turned off in Paramètres → Fonctions. Personnel without email are members with `clerk_user_id` null and a PIN (scrypt hash); PIN login on the restaurant tablet for service screens comes in M5.
- **Guide**: animated tutorials (CSS mock-ups synced to steps, autoplay, still when reduced motion) at `/app/guide` (members) and public `/guide` (personnel without an account; linked from the check-in page). Two audiences: « Gérants » (7) and « Personnel » (6). « Vu » progress is per device (localStorage); the dashboard shows « Apprendre à utiliser RestoCool ».
- **Numéro RC is the business identifier**: shown under a « Numéro RC » title on the main QR card (dashboard, end of setup) and on stickers. The platform admin (M7) must be able to look up any restaurant by its numéro RC (`access_codes` with `seat_id` null). Every RestoCool logo links to the home page `/` in one tap.
- **Hardening (after the reviews)**: customer orders carry a client `requestId` (`orders.client_request_id`, unique per restaurant): a resend returns the same order. Option groups' `max_select` is enforced on the server. The client IP for rate limits comes from `ipFromHeaders()` (src/lib/rate-limit.ts): the N-th X-Forwarded-For entry from the right, N = `TRUSTED_PROXY_HOPS` (default 1). The app menu only lists sections the member's role can open. French strings use non-breaking spaces before « : ; ! ? » and inside « ».
- **Business location**: `restaurants.latitude/longitude` (+ accuracy, source `gps` | `link`, set_at). Owners set it in setup (profile step) or Paramètres: « Je suis à mon établissement » (warning that customers will see it, then phone GPS, refused above 500 m accuracy) or a pasted Google Maps link (short links resolved on the server, redirects followed only on Google hosts). Preview on an OpenStreetMap frame (free). Customers get « Itinéraire » (Google Maps directions). `/api/admin/locations` (super admin) returns GeoJSON for the platform map (M7).
- **Job roles and access**: `job_roles` (per restaurant: catalog `key` with translated name, or a `name` the owner typed; `group` management/front/kitchen/bar/support; `access` = access areas from `src/lib/auth/access.ts`). `members.job_role_id`; the member's `role` enum stays as the level (`levelFor(access)`: a role with « staff » access is a lead = manager). `can()` uses the job role's access (capped at manager rights; the owner is never limited). Catalog: gérant·e, gérant·e adjoint·e, serveur·se, hôte·sse, caissier·ère, chef de cuisine, cuisinier·ère, aide-cuisinier·ère, plongeur·se, barman/barmaid, agent·e d'entretien, gardien·ne, livreur·se. Only the owner edits roles (`/app/staff/roles`) or gives a lead role; managers assign the others. Roles are created with the restaurant (and lazily for older ones, moving existing personnel onto the matching role).
- **Back office (owner/manager dashboard)**: « En direct » (sales and orders today, in progress, staff present, sold out), « À surveiller » (orders waiting > 5 min, ready to serve, locked PINs, sold out, unpublished menu, no location), « Tout gérer » shortcuts (filtered by `can()`), analytics, **personnel ranking** (`src/lib/analytics/backoffice.ts`: served ×3, confirmed/prepared/taken ×2, hour present ×1, day present ×2, app action ×1 up to 50; owner not ranked; `members.last_seen_at` updated at most every 5 min shows « Actif maintenant »), and the activity feed in words. **Order history** at `/app/orders` (reports.read): period/status/person/number-or-seat filters, CSV export `/api/app/orders/export` (UTF-8 BOM, formula-safe cells).
- **Mobile staff app**: on phones the app has native-style bottom tabs (4 main screens for the person's role, short names, + « Plus » sheet that the back button closes); the side menu is for tablets and up. a thin top progress bar (`nav-progress.tsx`) gives instant feedback on taps (no `loading.tsx`: it would turn 404 pages into 200). Staff service worker `/app/sw.js` (scope `/app/`): Next static files cache-first, pages and APIs always network (no business data stored on the device), an offline page in FR/EN/ZH. **Scanner** `/app/scan`: rear camera, native BarcodeDetector when present, else `jsqr` loaded only on that page (centre crop ≤ 480 px), torch when supported, camera stopped when the screen goes off; `scanTarget()` (`src/lib/scan.ts`) opens only RestoCool paths (order, check-in, menu/table, /c code) on the current site, or a typed numéro RC. E2E uses Chromium's fake camera filming a generated QR.
- **Joining the team (QR + owner approval)**: Personnel → « Inviter mon équipe » (`/app/staff/invite`) shows the team QR (`settings.joinToken`, regenerable) → `/rejoindre/<token>`: full name, phone (+226 or international with +), PIN chosen twice → `join_requests` (pending; same phone replaces the waiting one; max 30 pending; rate limited per IP). The person's phone follows it at `/rejoindre/statut` (http-only cookie `rc_join` = id.secret, only the hash stored; refreshes every 5 s). Owners/managers (staff.write) are prompted live on any app screen (`JoinPrompt`, `join` event on the staff stream; never sent to customers) and in « À surveiller »; they accept with a job role (lead roles: owner only) → member with the next matricule, phone and PIN, or decline. `members.phone` added. Email invites come later.
- **Not only restaurants**: generic UI text says « établissement » (EN "business", ZH 店铺): « Créer mon établissement », directory « Établissements sur RestoCool », RC fields, setup, personnel, check-in. Food-specific text (menu, dishes, kitchen) stays, and the home page lists restaurants, maquis, bars, fast-food, cafés/bakeries, hotels, caterers and shops. Code identifiers (`restaurants` table, `/r/{slug}`) are unchanged. RC number inputs use `.rc-code-input` (always white, dark text, thick green border) so they stay readable in phone dark mode.
- **Branded QR codes**: every QR (main, tables/rooms, print kit, PNG download, check-in, team invite) comes from `src/lib/qr-branded.ts`: error correction H, the RestoCool icon in a white rounded badge covering ~22 % of the width (centre modules left blank). SVG references `/brand/png/app-icon-192.png`; the PNG is drawn with `pngjs` (no native image library). A unit test decodes them with jsQR, including at sticker size.
- **City field**: `CityField` (`src/components/forms/city-field.tsx`) with `src/config/cities.ts` (Ouagadougou, Bobo-Dioulasso, then ~50 towns A–Z) and « Autre ville… » to type any other place; used when creating a business and in Paramètres.
- **Shangri-La (real restaurant)**: `npm run import:shangri-la [-- --owner-email=<owner>] [--draft] [--replace] [--if-missing]` creates; it also runs by itself on every deploy start (`.replit`: `--if-missing`, never blocks the start), owner email from `--owner-email` or the `SHANGRILA_OWNER_EMAIL` secret (optional, recorded later if added). It (published and featured first « À la une » by default; the others move down one place) « Shangri-La » (`/r/shangri-la`, Ouaga 2000) from `imports/shangri-la/` (data + photos copied from github.com/tieyiwe/shangri-la-menu, see SOURCE): 16 categories, 286 items FR/EN/ZH with codes, prices, spice, « nouveau », Champagne variants, 2 « sur demande », 78 photos (uploaded to the object store; logo as PNG, media keys may end in .png), 19 tables (no 13) + 12 rooms + takeaway with QR and RC codes, lacquer theme, setup marked done, Pro trial. **Prepared businesses**: `settings.ownerEmail`; `claimBusinessesByEmail` (`src/lib/restaurants/claim.ts`) runs on `/app/new` and makes the first sign-in with that *verified* email the owner (matricule 001), then removes the email. The public menu hides « Ouvert / Fermé » when no opening hours are set.
- **QR stickers**: French + English only (never Chinese, whatever the app language): « Scannez-moi · Scan me » above every QR and the numéro RC right below it: on printed cards, on the dashboard card, and in the downloaded image (`StickerDownload`, drawn on a canvas in the browser from the branded QR PNG, 1200 px wide, falls back to the plain QR image).
- **Adding personnel**: Personnel → « Ajouter du personnel » (`#add`) shows the onboarding QR on the page (full-screen version at `/app/staff/invite`) with the 3 steps, and « Ajouter à la main » for people without a smartphone. The back office shortcut points there.
- **Business photo**: Paramètres → Apparence asks for a photo of the business (front or interior) with a reminder until there is one; « À surveiller » shows « Ajoutez une photo… » while `cover_url` is empty.
- **M5.1 Authorised devices + PIN login**: `devices` (token SHA-256, revocable) and `staff_sessions` (token SHA-256, `expires_at` = shift, `last_activity_at`, `ended_at`), `src/lib/devices`. Personnel → Appareils (`/app/staff/devices`, devices.write, Pro/Business): « Autoriser cet appareil » sets the http-only `rc_device` cookie (400 days); « Passer en mode poste » signs the account out and opens `/poste`. `/poste`: the team (active, with PIN, never the owner) as plain links (`?who=`), big PIN keys; 5 wrong PINs lock 10 min (shared with check-in, `reservePinAttempt`); success sets `rc_staff` and opens the person's screen (kitchen / service / home). A PIN session is the member actor with `memberId` and `via: "pin"` (audit actor type « staff » + member id) and **comes first** in `getMemberContext`; it ends at the end of the shift (default 12 h), after the idle time (default 15 min, checked by the server and by the screen, which locks itself), on « Verrouiller », on a new login on the same device, or when the device is revoked. Middleware lets a request with `rc_staff` past the sign-in gate (every page/API still validates it); without a valid session, pages go back to `/poste?locked=1`.
- **Transport (VIP buses with food on board)**: `restaurants.kind` = `restaurant` | `transport`, chosen at creation (« Transport : bus VIP avec repas à bord »; per-seat QR + hostess confirms). `buses` (name, `layout` jsonb {rows, left, right, doorRow, doorSide, back}, own `qr_token` → `/r/{slug}/b/{token}`), seats of type `seat` with `bus_id`, `map_row`, `map_col`, `position` (labels unique per bus). `src/lib/transport/layout.ts` builds the seat map (Elitis numbering: left window→aisle, then right window→aisle « 1 2 | 4 3 », door row skips the door side, back row left→right; Elitis = 12 rows, door 7, back 4 → 50). Changing a layout keeps the QR of seats whose number still exists; not during a trip. `routes` (itineraries origin → destination) + `route_assignments` (hostesses per itinerary); `trips` (bus + itinerary + departure, one open per bus) and `orders.trip_id` (T2). Pages: `/app/buses` (replaces « Tables et salles » for transport: buses with live map editor, itineraries, assignments), `/app/buses/[id]/print` (seat-back cards FR/EN + the bus QR); setup wizard step « service » adds the first bus.
- **Transport T2/T3 (trips and hostess rounds)**: the hostess starts a trip (`/app/trips`: bus + one of *her* itineraries, leads see all; one open trip per bus). Without an open trip travelers can read the menu but ordering returns `no_trip` (409). The traveler scans the bus QR (or a seat-back QR), picks the seat on the map (`BusPicker`); a seat already chosen on another phone asks « C'est bien mon siège ? »: allowed, each phone keeps its own bill (no group bill for `seat`), and the hostess sees the seat in red (« doubles »). Orders carry `trip_id`; « Montrer à l'hôtesse ». Hostess rounds: `/app/scan?trip=<id>` keeps the camera open and collects order QRs, then `/app/trips/<id>?round=ids` confirms the round in one tap; the trip page lists orders by seat number, « À préparer » totals, « Tout confirmer » / « Tout servir » (`src/lib/transport/rounds.ts`, orders already moved by someone else are skipped). Ending a trip closes every seat session of the bus. Catalog roles by kind (`catalogFor(kind)`): transport has hôtesse, chef de cabine, chauffeur (server→hostess). Seed: « Express Démo » (`/r/express-demo`, Bus 12 Elitis 50 seats, 3 itineraries, hostess Fatim matricule 002 PIN 2468 on Ouaga→Bobo).
- **Email (Titan, info@restocool.com)**: `src/lib/email/mailer.ts` sends over SMTP with nodemailer. Replit Secrets: `SMTP_PASS` (the mailbox password, required to send); optional `SMTP_HOST` (default smtp.titan.email), `SMTP_PORT` (465, SSL), `SMTP_USER` (info@restocool.com), `MAIL_FROM` (« RestoCool <info@restocool.com> »). Without `SMTP_PASS` nothing is sent (dev writes the HTML to `.data/outbox/`). `email_log` (one row per business + kind, no content stored) guarantees one welcome email per business. **Welcome email** (`src/lib/email/welcome.ts`, texts in `email.welcome` FR/EN/ZH, owner's app language): sent in the background (`after()`) when an owner creates a business, only to a verified email: « Laafi », numéro RC, launch offer, 3 first steps, features (transport variant), why RestoCool, CTA to /app, menu link.
- **Launch offer**: `FREE_LAUNCH` in `src/config/plans.ts` (true until online payment exists): a Pro trial never becomes « en retard »; the dashboard shows « Offert pendant le lancement ». Turn it off the day plans can be paid.
- **Fortune cookie for everyone**: a business with no fortunes of its own uses the built-in ones (`src/config/fortunes.ts`).
- **Order buttons follow permissions**: the service board and order page get the person's rights (`OrderPermsProvider`, from `servicePage()`): a server without « préparer » goes from « confirmée » straight to « Servi »; « Annuler » only for those who may cancel. « Montrer au serveur » shows every translated name under the French one (Chinese for Shangri-La's staff).
- **Shangri-La QR**: generic (customers pick their table or room from the main QR, with the « déjà prise » warning; table/room QRs still work). The import switches an existing unowned Shangri-La to it once. E2E `tests/e2e/shangri-la.spec.ts` runs on the real menu (imported in global setup).
- **Brand palettes**: `src/config/palettes.ts` (16 palettes: 11 for the light themes, 5 for « laque »; a unit test checks each main colour is readable on its themes). Paramètres → Apparence (and the setup wizard): theme, palette, or each colour by hand. **Main colour** = `restaurants.accent_color` (buttons, active tabs, category titles); **accent colour** = `settings.accent2` (default gold): band under the cover photo, « Nouveau » badges, line under category titles, welcome card and confetti. Public menu CSS vars `--accent-2` / `--on-accent-2` (black or white by contrast, `textOn()`). Shangri-La: « Laque d'or » (gold + lacquer red).
- **Unique business names**: a name is taken when its address (`/r/<slug>`) is used or another business has the same name (case-insensitive). `/app/new` checks live (`/api/app/name-check`, signed-in, rate limited): « ✓ Nom disponible », or « déjà utilisé » with 1–3 free close names (`src/lib/restaurants/name-check.ts`: + town, « Chez … », « Maquis … », « … Centre », « … 2 »; transport: Voyages, Express…) that fill the field in one tap; the button stays disabled. The server refuses too (`NameTakenError`, no more silent « -2 » suffix; a simultaneous race: one wins, the others get suggestions).
- **« Personnalisez votre page » guide** (`src/components/onboarding/customize-guide.tsx`): the owner's own page header drawn with their current logo, photo, name, slogan, colours, with numbered pins 1–5 and the matching checklist (logo, photo, name + slogan, colours, contacts) linking to Paramètres (#appearance, #profile, #contacts) + « Voir ma page comme un client ». Shown at the end of setup and on the dashboard (settings.write) until all 5 are done. The description field is labelled « Slogan ou présentation courte ».
- **Takeaway WhatsApp**: under the WhatsApp field (setup step « contacts » and Paramètres), « Est-ce ce WhatsApp qui reçoit vos commandes à emporter ? » (checked by default). Unchecked: a second number is required (`settings.takeawayWhatsapp`, error `takeaway_whatsapp_missing`). The public menu's « À emporter » sends to `takeawayWhatsapp ?? whatsapp`.
- **Takeaway on the platform** (WhatsApp is only the second way): the customer picks « À emporter » as their place; the cart asks name + phone (required, `takeaway_required`) and a pickup time (optional, `orders.pickup_time`). Staff see the name, a tap-to-call phone and « Retrait à 12:30 » on the card. With ordering on, the WhatsApp button reads « Ou commander à emporter par WhatsApp ».
- **Order numbers**: every order gets `orders.code` = initials + business date + number of the day, « SL-261112-007 » (`src/lib/orders/code.ts`: hyphenated names give one initial per part, small words dropped, one word = 2 letters), unique per business (partial unique index), set at creation and never changed by a rename; migration 0020 fills it for older orders from the slug. Shown on staff cards (with date and time « 12/11 · 19:42 »), the customer's orders, « Montrer au serveur », the trip board, the history (searchable by full number, also by name or phone; the full number ignores the period) and the CSV export.
- **First received, first served**: the service board and kitchen list each column oldest first (also sorted on screen), with a « 1er, 2e… » badge and « Du plus ancien au plus récent » (served column: latest first). The hostess trip board stays by seat number (aisle order); the history stays newest first.
- **Data safety across republishes** (docs/BACKUP.md): deploy start = `npm run db:backup` (pg_dump → Object Storage `backups/`, last 14 kept; `npm run db:restore -- <name> --yes`) → `npm run db:migrate` → app. Migrations are additive only: `tests/unit/migrations-safe.test.ts` fails on DROP/TRUNCATE/DELETE/RENAME/retype unless the line before says `-- data-safe: <reason>`; never edit an applied migration. `npm run db:seed` never wipes (keeps existing demos; `--reset` for tests). Demo slugs and app paths are in `RESERVED_SLUGS`. Production with local-disk storage logs `storage_local_in_production`. On Replit's publish screen, accept only additive database changes.
- **Security hardening (audit)**: live streams capped per visitor IP (40) and per staff person (8) (`sseResponse(..., { key, max })`, 429 above); photo uploads must declare their size (411 otherwise, 413 above the limit) before the form is read; headers add HSTS with subdomains (2 years), `Cross-Origin-Opener-Policy: same-origin-allow-popups`, a stricter `Permissions-Policy` (camera/geolocation self; microphone, payment, usb, serial off). Reviewed and fine: every `/api/app` route checks the member and business, public routes are rate limited and validated, PINs lock after 5 tries, cookies are httpOnly/secure/sameSite, the Maps link resolver only follows Google hosts, super admin needs a verified email. Known: a moderate `uuid` advisory inside Replit's storage SDK (not reachable: no buffer argument is ever passed), no fix upstream yet.
- **Performance pass**: public menu JS 159 → 132 KB (bus seat map loaded only when a traveler opens it, `next/dynamic`); indexes `orders (restaurant_id, sent_at)` and `orders (trip_id)` (migration 0021); photos served from an in-memory LRU (96 MB, files ≤ 2 MB, evicted on delete) in front of Object Storage (`getMediaCached`). Measured on the production build: pages answer in 10–30 ms server time; Shangri-La's 286-dish menu is 55 KB compressed HTML.
- **SEO and AI discoverability** (`src/lib/seo/`, free, no client JS): `metadataBase` = APP_URL (else request host); every public page has a title/description from `seo.*` / page messages, an absolute canonical and Open Graph/Twitter cards; `/restaurants?q=` is noindex,follow; legal pages have hreflang fr (`/privacy`) / en (`?lang=en`). No other hreflang: menus and the landing have no language URL. **noindex** on `/app`, `/admin`, `/poste`, `/pointage`, `/rejoindre`, sign-in/up, token links `/r/x/t|b/<token>` and owner previews (metadata `NOINDEX` + `X-Robots-Tag` in next.config for those paths and `/api` except `/api/media`). `robots.ts` (all crawlers incl. GPTBot, ClaudeBot, PerplexityBot, Google-Extended…; disallows private paths and `/r/*/t/`, `/r/*/b/`; `/app$` + `/app/` so `/apple-icon.png` stays open) and `sitemap.ts` (static pages + published businesses, lastmod = latest of business / dish update). Share images with `next/og` (`src/app/opengraph-image.tsx`, `src/app/r/[slug]/opengraph-image.tsx`: business colours, name, town; built-in font, no fetch; Latin names only render well). JSON-LD via `<JsonLd>` (`serializeJsonLd` escapes `<`, `>`, `&`, U+2028/9): home = Organization + WebSite (SearchAction → `/restaurants?q=`) + SoftwareApplication (plans in XOF from `plans.ts`) + FAQPage (the 6 visible questions); directory = CollectionPage/ItemList; business = Restaurant (transport: LocalBusiness + OfferCatalog) with address (country BF only for towns of `cities.ts`), geo, phone, RC identifier, hours, price range, `acceptsReservations: false`, Menu → MenuSection → MenuItem (EN/ZH as alternateName, « sur demande » = no offer) + BreadcrumbList. Never ratings, reviews or cuisine we were not given. AI files: `/llms.txt`, `/llms-full.txt` (FAQ EN+FR and the first 30 menus), `/restaurants.json`, `/r/{slug}/menu.json` (published only, rate limited, public facts only: no ids, tokens, staff, orders, settings or payment numbers). IndexNow not used (would need a key file and a ping on publish; the sitemap is enough for now).
- **Order QR for any camera** (`/o/{id}`): the « Montrer au serveur » QR points to `/o/<order id>` (route handler). A member of that restaurant (account, switched to it if they have several; or a PIN session of that restaurant) goes straight to `/app/orders/<id>`; anyone else lands on `/o/<id>/aide` (noindex): « Vous travaillez chez X ? » sign-in with `redirect_url` back to the order, or the restaurant tablet (`/poste`); « Pas encore dans l'équipe ? » a manager must add you: scan their « Rejoindre l'équipe » QR (3 steps); « ce compte ne fait pas partie de l'équipe » for other accounts; never the order content. The in-app scanner accepts `/o/` and `/app/orders/` links. Customers can always change their place (« Changer ») when the restaurant offers a picker, even after scanning a table QR; the token then leaves the address.
- **M7 Super admin console** (`/admin_pro`: renamed from `/admin`, which is now a 404; not listed in robots.txt, which is public; noindex header + meta; verified email in `SUPERADMIN_EMAILS`; every page calls `requireSuperadminPage()` and every action/API `requireSuperadmin()`: anyone else gets a plain 404, signed in or not — `/admin_pro` is deliberately not behind the middleware sign-in redirect so its existence is not revealed; the app's « Super admin » link only for the super admin; dev-only cookie `rc_dev_not_superadmin=1` tests the refusal; reactivating a suspended business restores what its plan says (free → active, paid past its end → past_due); every change audited with the admin's email). **English by default, French on demand** (EN/FR switch, cookie `rc_admin_lang`, `src/lib/admin/i18n.ts`; no Chinese — `zh.json` holds English copies for key parity). Pages: **Overview** (`src/lib/admin/metrics.ts`: businesses total/online/new/active, orders today/7/30 d, order volume, MRR from active paid plans + potential from trials, collected 30 d, open errors, orders/day and sign-ups/week SVG charts, funnel created→set up→menu→online→first order, plans × status, towns, top 8, plans ending within 14 d); **Businesses** (search name/slug/town/owner email/numéro RC, filters plan/status/kind/online, sorts, CSV `/api/admin/businesses`); **Business page** (contact WhatsApp/phone/email, figures, *record a payment* → plan active + end moved by months from today or current end, manual plan/status/end, publish/unpublish, suspend/reactivate with reason — never deletes data, « À la une » rank 1–3 shifting others, read-only menu/team/latest orders, plan history, internal notes `admin_notes`, activity); **Subscriptions** (income per month, every plan event, renewals); **Map** (Leaflet + OpenStreetMap tiles, located businesses); **Activity & errors** (`/admin_pro/activity`; `app_errors` grouped by fingerprint with counts, resolve/resolve all; audit log filter); **Settings** (`platform_settings`: launch offer on/off at runtime — `freeLaunchActive()` flag cached 15 s, replaces the `FREE_LAUNCH` constant as source of truth; announcement banner FR/EN/ZH shown on every business's app; featured list). Errors reach `app_errors` through `src/instrumentation.ts` → `instrumentation-node.ts` (`onRequestError` + `log.error` sink). The business app shows a « Super admin » link to the super admin. `getRequestConfig` now honours an explicit locale (`getTranslations({ locale })`), so emails go out in the owner's language.
- **Console collaborators** (`/admin_pro/team`, perm `team`): owners = `SUPERADMIN_EMAILS` (everything, not editable in the app); collaborators = `admin_collaborators` (verified email, `perms[]`, active). Permissions (`src/lib/admin/access.ts`): dashboard, businesses.read/write, billing.read/write, support, recovery, comms, activity, settings, team (`normalizePerms` adds what one needs, e.g. billing.write → billing.read + businesses.read). « team » and « settings » are owner-only; a collaborator never grants more than they have nor edits their own access. Presets: support agent, sales & billing, analyst, operations manager. `getSuperadmin()` returns `{owner, perms, name}`; `requireSuperadmin(perm)` (404 if not in the console, 403 → `?error=forbidden` without the perm), `requireSuperadminPage(perm)` (→ `/admin_pro?denied=1`); the nav only lists allowed pages (`PAGE_PERM`); the business page hides payment/plan forms (billing.write) and publish/suspend/featured (businesses.write). Dev-only cookie `rc_dev_admin_as=<email>` acts as a collaborator.
- **Live usage & traffic**: every page sends a heartbeat (`<Beat/>` in the root layout, on open + every 60 s while visible; nothing on `/admin_pro`): `/api/app/heartbeat` (members: `app_usage` minutes/views per person per day + live presence as owner/manager/staff) and `/api/public/beat` (customers on `/r/…`, visitors elsewhere; anonymous hashed device key, bots ignored, rate limited). Live presence is in memory (`src/lib/usage/presence.ts`, one long-lived process); every minute it writes `traffic_minutes` (minute × audience × device, 120 days) and each person once a day in `traffic_visitors` (400 days, device phone/tablet/desktop + OS + installed app). `/admin_pro/live` (perm dashboard, refreshes every 30 s): online now by audience and device, peak, orders waiting (sent/confirmed/preparing/ready, late > 15 min), processed today (served/paid), cancelled, average time to serve, last hour / 24 h / 30 days charts, per-business table; the overview has a live strip, the business page a « Live & today » band.
- **Support requests** (« Aide et signalement », `/app/support`, any member, from the sidebar, the 🛟 header icon on every screen with the current screen attached): urgency low « Peut attendre » / medium « Gênant » / high « Bloquant », category, subject, text, optional contact → `support_requests` (ref « D-000123 », business, person, role, screen, user agent, timestamps: received, first answer, resolved) + `support_messages` (conversation). Owners/managers see all of the business's requests, others their own. Console `/admin_pro/support` (perm support): blocking first then oldest, filters, badge in the nav; answer + status (new / in progress / waiting for the business / resolved) + assign; the business gets the answer in the app (bell). Blocking requests are also emailed to the console owners (when SMTP is set). Locked-out people use the public `/aide` (numéro RC, business name, name, phone, role, urgency; honeypot + 3 per IP per 15 min; matched to the business by RC, nothing shown back), linked from sign-in and `/poste`.
- **Account recovery** (`/admin_pro/recovery`, perm recovery; also from a request and the business page): find the business by numéro RC, then type what the caller says — the records are never displayed on that page. Verified = RC matches + at least 3 of: business name, town, a phone of the business or its team (last 8 digits), owner email/name, « I called back a known number ». `recovery_cases` stores booleans only; a verified case allows actions for 30 min, only for the admin who checked: unlock PIN, new 6-digit PIN (shown once, never stored in clear or put in a URL; ends that person's PIN sessions; not for an owner who signs in with an account), lift Clerk's sign-in lock (`users.unlockUser`, when Clerk is configured), or hand the business to a new owner email (`settings.ownerEmail` + `ownerTransfer`: the first sign-in with that verified email becomes owner and the old owner account is switched off and kept). Passwords stay with Clerk (« Mot de passe oublié »). Everything audited.
- **Messages & in-app notifications** (`/admin_pro/messages`, perm comms; « Send a message » on a business page): type (new feature, news, maintenance, subscription, personal), title/text FR (EN/ZH optional), link, who in each business (owners / owners+managers / whole team), targeting (plans, kinds, towns, numéros RC; empty = all), optional pop-up (new features: opens once at the next app opening), optional email to owners' verified emails, expiry; withdraw = expire now. `platform_messages` + `platform_message_reads` (per member). App: 🔔 bell in the header (unread messages + unread support answers; polls every 45 s, on each screen and right away on the `notice` live event sent on the staff stream, never to customers), `/app/notifications` (opening marks read), pop-up dialog. Read counts per message in the console. The older one-line announcement banner (Settings) still exists.
- **Desktop app shell** (md+): fixed sidebar with grouped sections (Service / Gestion / Aide, current page highlighted, badges), business switcher, « Installer RestoCool » card (owners/managers: one click via `beforeinstallprompt` on Chrome/Edge, steps for Safari Mac « Ajouter au Dock » and iPhone/iPad; hidden when installed, 14 days after « Plus tard »), help button; top bar with « Aller à… » command palette (Ctrl/⌘ K), bell, help, language; content max-width 7xl. Phones keep the bottom tabs. Manifest: `id`, `display_override` window-controls-overlay, shortcuts (Service, Cuisine, Commandes).
- **Numéro RC typeahead**: the RC field (home « Vous êtes sur place ? », `/c`) suggests published businesses whose main code starts with what is typed (`/api/public/restaurants?rc=K7`, `suggestByRc`), one tap opens the menu. « Vus récemment »: the last 6 menus opened on the phone (`localStorage` `rc-recent-places`, written by the public menu, not in owner preview), reopen or remove. Home text: « Scannez le QR code de l’établissement, ou tapez le numéro RC écrit juste en dessous, pour ouvrir le menu. »
