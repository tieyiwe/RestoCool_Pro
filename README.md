# RestoCool

Digital menu, QR ordering and dining-room management for restaurants in Burkina Faso.
A product of **TIBLOGICS**. The full product brief is in [`CLAUDE.md`](./CLAUDE.md).

**Status:** Milestone 1 (Foundation) done. See [M1 notes](#m1-foundation) below.

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
