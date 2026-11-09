# RestoCool

Digital menu, QR ordering and dining-room management for restaurants in Burkina Faso.
A product of **TIBLOGICS**. The full product brief is in [`CLAUDE.md`](./CLAUDE.md).

**Status:** Milestones 1 (Foundation) and 2 (Onboarding and public menu) done. See the demo scripts below.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 + shadcn/ui ·
Drizzle ORM on Replit PostgreSQL · Clerk (Organizations) · next-intl (FR default, EN, ZH) ·
Vitest · Playwright.

## Run it on Replit

1. **Import**: Replit → *Create Repl* → *Import from GitHub* → `tieyiwe/RestoCool_Pro`.
2. **Database**: open the *Database* pane and create a PostgreSQL database
   (`DATABASE_URL` is added to Secrets for you).
3. **Secrets**: add the variables from [`.env.example`](./.env.example) that are not already there.
   Without Clerk keys, `DEV_AUTH_BYPASS=1` lets you try `/app` and `/admin` in development.
4. **Shell**:
   ```bash
   npm install
   npm run db:migrate
   npm run db:seed
   ```
5. Press **Run**. Open `/r/restaurant-demo` (public menu), `/app` (owner) and `/admin`.

### Sign-in (Clerk)

Clerk only handles sign-in. Restaurants, memberships and roles are stored in PostgreSQL
(`members` table), so there is nothing to configure in Clerk beyond the keys:

- **Replit-managed Clerk**: keys are added automatically. Nothing else to do.
- **Your own Clerk app**: copy the publishable and secret keys into Replit Secrets.

After signing in, a new user is sent to `/app/new` to create their restaurant (30-day Pro trial).
Someone who belongs to several restaurants switches between them from the header.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 5000 |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | TypeScript strict check |
| `npm test` | Vitest unit + integration (integration needs `DATABASE_URL`) |
| `npm run test:e2e` | Playwright at 390px and 1024px (uses `E2E_DATABASE_URL`, default `restocool_test`) |
| `npm run db:generate` | New migration from schema changes |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | (Re)create the fictional « Restaurant Démo » |

Photos are stored in Replit Object Storage on Replit (create it in the *Storage* pane) and in `./.data/uploads` elsewhere. Force one with `STORAGE_DRIVER=replit|local`.

## Architecture rules

- **Tenant isolation**: application code reads tenant data only through `tenantRepo(db, restaurantId)`
  (`src/db/repos/tenant.ts`). The `restaurantId` comes from the authenticated context, never from request input.
- **Permissions**: `can(actor, action, resource)` in `src/lib/auth/can.ts`, checked on the server in every handler.
- **Plans**: limits live in `src/config/plans.ts`; check them with `assertPlan()` / `assertWithinLimit()`.
- **Audit**: `writeAudit()` records who did what, inside the same transaction as the change.
- **i18n**: every UI string is in `src/messages/{fr,en,zh}.json` (a test checks the keys match).
  To add Mooré or Dioula later, add the code to `src/i18n/config.ts` and a messages file.
- **Money** is integer FCFA, shown as `5 300 F` (`formatFCFA`). A missing price shows « Sur demande », never `0 F`.
- **Branches**: a branch is a full restaurant with `parent_restaurant_id`.
- **Tenants and roles**: app-managed. Clerk proves identity; the `members` table decides which restaurants a user can open and with which role. The active restaurant cookie is re-checked against `members` on every request.

## M1: Foundation

- Schema: `restaurants`, `members`, `opening_hours`, `areas`, `seats`, `menu_categories`, `menu_items`,
  `menu_item_variants`, `menu_item_options`, `fortunes`, `audit_log`, `plan_events`.
- Layouts: public menu (`/r/[slug]`, no Clerk JS shipped), owner app (`/app`), super admin (`/admin`).
- Brand: two-part « Resto + Cool » logo, 32px app icon, green primary with red/yellow accents,
  Faso Dan Fani–inspired texture, 3 menu themes (lacquer, light, warm).
- Seed: « Restaurant Démo » (fictional), Ouagadougou: 6 categories, 40 dishes in FR/EN/ZH, variants,
  spicy levels, prices « sur demande », 10 tables, 2 areas, 3 salons, 24 fortunes, generated placeholder images.

### Demo script

1. `/` → holding page → « Voir le menu de démonstration ».
2. `/r/restaurant-demo` → categories bar, FCFA prices, Chinese names under French ones,
   « Sur demande » on the grilled fish, `48 000 F / 78 000 F` on the champagne.
3. `/app` → dashboard: Pro trial badge, counts (6 / 40 / 14 / 2), recent activity. Switch FR / EN / 中文.
4. `/app/new` → create a second restaurant; you land on its (empty) dashboard; switch back with the header selector.
5. `/admin` → restaurant list.
6. `/api/health` → `{"status":"ok","db":"ok"}`.

## M2: Onboarding and public menu

- **Setup wizard** after « Créer mon restaurant »: profile and menu address, contacts (+226, WhatsApp, Orange Money, Moov), opening hours (past midnight supported), seating modes, QR strategy, order validation, languages, theme and accent colour (contrast-checked), logo and cover.
- **Menu manager** (`/app/menu`): categories (add, rename in 3 languages, reorder, hide, lunch-only time windows, delete when empty); dishes with number, FR/EN/ZH names and descriptions, « Suggérer » (built-in glossary, no paid AI), price or « sur demande », variants, options, spice level, labels, kitchen station, photo; « Épuisé aujourd’hui » (until midnight), hide/show, duplicate, reorder, delete. Gratuit plan limited to 40 dishes.
- **Photos**: compressed in the browser to WebP (max 1200px + 168px thumbnail), with the size saved shown, uploaded to Object Storage, served with year-long caching.
- **Settings** (`/app/settings`) and **publish / unpublish** (needs at least one visible dish); owners preview an unpublished menu.
- **Public menu** (`/r/{slug}`): sticky tabs following the scroll, search in FR/EN/ZH, filters (spicy, new, local produce), numbered dishes, badges, names in the other languages under each dish, photos with full-screen viewer (swipe left/right, swipe down to close), language for the visit only, welcome screen with confetti (3 s, once per visit), share (native or WhatsApp / Facebook / copy), contact with open/closed, tap-to-call, WhatsApp button and QR, mobile money numbers with « Copier », hours, Google Maps; « Ma sélection » with variant chooser, steppers and running total (« sur demande » never counted as 0 F); takeaway by WhatsApp (prefilled French message); fortune cookie; low-data mode; back-to-top; the phone's back button closes panels.
- **Offline / install**: service worker for `/r/` (pages network-first, images and app files cache-first, new caches on each deploy) and a per-restaurant manifest.

### M2 demo script

1. `/app/new` → create « Maquis Test » → the 5-step wizard → « Ajouter mes plats ».
2. Add a category, then a dish: type « Riz gras », press « ✨ Suggérer » (EN and 中文 fill in), add two variants, add a photo (see the compressed size), save.
3. `/app/settings` → « Publier mon menu » → open the menu.
4. `/r/restaurant-demo` on a phone: welcome screen; search « chicken » or « 洛神花 »; 🌶️ filter; switch to EN, reload (stays EN), open in a new tab (back to FR); add the Champagne → choose Magnum; open « Ma sélection »; press the phone's back button (the panel closes); « Commander à emporter (WhatsApp) »; tap a photo and swipe; turn on « Économie de données »; open the fortune cookie.
5. `/app/menu` → « Marquer épuisé » on a dish → it shows « Épuisé aujourd’hui » on the menu and cannot be added.

### Not in M2 (planned)

Seat choice, « Montrer au serveur » with order QR, live order tracking and « Sélections précédentes » need orders and seats (M3–M4). Still to do from the menu section of the brief: drag-and-drop ordering (up/down buttons for now), a manual crop tool (thumbnails are centre-cropped), CSV import/export, price change by percentage, the « Plat du jour » banner, and editing the fortune list (it can be turned off).
