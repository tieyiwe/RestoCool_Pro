import "./_env";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { is, sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { closeDb, getDb, schema } from "../src/db";

const FOLDER = "./drizzle";

/** Postgres "already exists" errors: duplicate type, table/index, column, schema, object/constraint, function. */
const ALREADY_EXISTS = new Set(["42710", "42P07", "42701", "42P06", "42723"]);

function pgCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.cause?.code ?? e?.code;
}

/**
 * Applies the pending migrations one statement at a time.
 *
 * Replit can copy the development database's structure to production when publishing (all of it,
 * or only some of the changes). Production then already has some of the new tables, columns or
 * indexes, but Drizzle's migration log doesn't know. A statement whose object already exists is
 * skipped; every other statement runs. Each migration is one transaction (with a savepoint per
 * statement), so a real error leaves the database as it was and stops the deploy (the previous
 * version keeps running).
 */
async function applyPending(): Promise<{ applied: number; skipped: number }> {
  const db = getDb();
  await db.execute(sql`create schema if not exists drizzle`);
  await db.execute(sql`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`);
  const last = await db.execute<{ created_at: string | null }>(sql`select max(created_at)::text as created_at from drizzle.__drizzle_migrations`);
  const lastAt = Number(last.rows[0]?.created_at ?? 0);
  let applied = 0;
  let skipped = 0;
  for (const m of readMigrationFiles({ migrationsFolder: FOLDER })) {
    if (m.folderMillis <= lastAt) continue;
    await db.transaction(async (tx) => {
      for (const stmt of m.sql) {
        if (!stmt.trim()) continue;
        await tx.execute(sql.raw("savepoint rc_stmt"));
        try {
          await tx.execute(sql.raw(stmt));
          await tx.execute(sql.raw("release savepoint rc_stmt"));
        } catch (err) {
          if (!ALREADY_EXISTS.has(pgCode(err) ?? "")) {
            console.error(`✗ migration failed in ${new Date(m.folderMillis).toISOString()} (hash ${m.hash.slice(0, 8)}):\n${stmt.trim().slice(0, 400)}`);
            throw err;
          }
          await tx.execute(sql.raw("rollback to savepoint rc_stmt"));
          skipped++;
        }
      }
      await tx.execute(sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${m.hash}, ${m.folderMillis})`);
    });
    applied++;
  }
  return { applied, skipped };
}

/** Every table and column defined in src/db/schema must exist, or the app would fail at runtime. */
async function missingColumns(): Promise<string[]> {
  const db = getDb();
  const rows = await db.execute<{ table_name: string; column_name: string }>(
    sql`select table_name, column_name from information_schema.columns where table_schema = 'public'`,
  );
  const have = new Set(rows.rows.map((r) => `${r.table_name}.${r.column_name}`));
  const tables = new Set(rows.rows.map((r) => r.table_name));
  const missing: string[] = [];
  for (const v of Object.values(schema) as unknown[]) {
    if (!is(v, PgTable)) continue;
    const t = getTableConfig(v);
    if (!tables.has(t.name)) {
      missing.push(`${t.name} (table)`);
      continue;
    }
    for (const c of t.columns) if (!have.has(`${t.name}.${c.name}`)) missing.push(`${t.name}.${c.name}`);
  }
  return missing;
}

async function main() {
  const { applied, skipped } = await applyPending();
  if (skipped > 0) console.warn(`! ${skipped} statement(s) skipped: already in the database (structure synced by the host)`);
  const missing = await missingColumns();
  if (missing.length > 0) {
    throw new Error(`The database is missing what the app needs: ${missing.join(", ")}. Nothing was started; the previous version keeps running.`);
  }
  console.log(`✓ migrations applied (${applied} new), database structure complete`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
