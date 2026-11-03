import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __rcPool?: Pool; __rcDb?: DB };

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Add it in Replit Secrets (Database pane).");
  return new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 10) });
}

/** Lazily created so `next build` works without a database. Reused across hot reloads. */
export function getDb(): DB {
  if (!globalForDb.__rcDb) {
    globalForDb.__rcPool ??= createPool();
    globalForDb.__rcDb = drizzle(globalForDb.__rcPool, { schema });
  }
  return globalForDb.__rcDb;
}

export async function closeDb(): Promise<void> {
  await globalForDb.__rcPool?.end();
  globalForDb.__rcPool = undefined;
  globalForDb.__rcDb = undefined;
}

export { schema };
