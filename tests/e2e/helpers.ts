import { Pool } from "pg";

/** Direct DB read used only to discover the other tenant's ids for isolation tests. */
export async function testTenantItemId(): Promise<string> {
  const pool = new Pool({ connectionString: process.env.E2E_DATABASE_URL });
  try {
    const { rows } = await pool.query<{ id: string }>(
      "select i.id from menu_items i join restaurants r on r.id = i.restaurant_id where r.slug = 'maquis-temoin' limit 1",
    );
    if (!rows[0]) throw new Error("test tenant not seeded");
    return rows[0].id;
  } finally {
    await pool.end();
  }
}
