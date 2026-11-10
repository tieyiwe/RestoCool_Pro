import "./_env";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { is, sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb, schema } from "../src/db";

const FOLDER = "./drizzle";

/** Postgres "already exists" errors: duplicate type, table, column, schema, object. */
const ALREADY_EXISTS = new Set(["42710", "42P07", "42701", "42P06", "42723"]);

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code;
}

/** Every table defined in src/db/schema must exist, or the app would fail at runtime. */
async function missingTables(): Promise<string[]> {
  const db = getDb();
  const wanted = (Object.values(schema) as unknown[]).filter((v): v is PgTable => is(v, PgTable)).map((t) => getTableConfig(t).name);
  const rows = await db.execute<{ table_name: string }>(sql`select table_name from information_schema.tables where table_schema = 'public'`);
  const have = new Set(rows.rows.map((r) => r.table_name));
  return wanted.filter((n) => !have.has(n));
}

/**
 * Replit copies the development database's structure to production when publishing.
 * Production then already has the new tables, but Drizzle's migration log doesn't know,
 * so re-running the SQL fails with "already exists". In that case, record the pending
 * migrations as applied (after checking every table really exists) instead of crashing.
 */
async function baseline() {
  const db = getDb();
  const migrations = readMigrationFiles({ migrationsFolder: FOLDER });
  await db.execute(sql`create schema if not exists drizzle`);
  await db.execute(sql`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`);
  const last = await db.execute<{ created_at: string | null }>(sql`select max(created_at)::text as created_at from drizzle.__drizzle_migrations`);
  const lastAt = Number(last.rows[0]?.created_at ?? 0);
  let recorded = 0;
  for (const m of migrations) {
    if (m.folderMillis > lastAt) {
      await db.execute(sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${m.hash}, ${m.folderMillis})`);
      recorded++;
    }
  }
  return recorded;
}

async function main() {
  try {
    await migrate(getDb(), { migrationsFolder: FOLDER });
    console.log("✓ migrations applied");
    return;
  } catch (err) {
    if (!ALREADY_EXISTS.has(pgCode(err) ?? "")) throw err;
    console.warn(`! schema objects already exist (code ${pgCode(err)}): the database structure was synced by the host. Checking tables…`);
  }
  const missing = await missingTables();
  if (missing.length > 0) {
    throw new Error(`Cannot baseline: these tables are missing: ${missing.join(", ")}. Fix the database, then run the migrations again.`);
  }
  const n = await baseline();
  console.warn(`! recorded ${n} migration(s) as already applied (tables present)`);
  // Anything newer than what was recorded still runs normally.
  await migrate(getDb(), { migrationsFolder: FOLDER });
  console.log("✓ migrations applied");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
