# Keeping data safe across republishes

Republishing RestoCool on Replit **never deletes** businesses, accounts, orders, photos or settings:

- **Data lives outside the app.** Businesses, members, orders… are in the production PostgreSQL
  database; photos are in Replit Object Storage. Republishing replaces the code only.
- **Every start backs up first.** The deploy command (`node scripts/serve.mjs`) opens the port at
  once, then runs `npm run db:backup` (a full `pg_dump` saved in Object Storage under `backups/`,
  the 14 most recent kept), then `npm run db:migrate`, and only then hands the port to `next start`. If the
  migrations fail, the new version stops and the previous one keeps serving.
- **Migrations only add.** A unit test (`tests/unit/migrations-safe.test.ts`) fails if a
  migration drops, empties, renames or retypes a table or column without an explicit
  `-- data-safe: <reason>` line. Never edit an applied migration; add a new one.
- **The seed never wipes.** `npm run db:seed` only creates the demo businesses when they are
  missing (`--reset` recreates them, for tests). Their addresses are reserved, so no real
  business can ever use them.
- **The Shangri-La import never deletes** (`--replace` is manual only).

## When publishing on Replit

If Replit's publish screen proposes database changes, **only accept additions**. Never accept a
change that drops a table or a column: it would delete that data in production.

## Back up / restore by hand

```bash
npm run db:backup
```

```bash
npm run db:restore -- --list
```

```bash
npm run db:restore -- backups/restocool-2026-11-12T08-00-00.dump --yes
```

The restore replaces the current data of `DATABASE_URL` with the backup's. Try it on a copy first
if you can (point `DATABASE_URL` at another database).
