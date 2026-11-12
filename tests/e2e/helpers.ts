import type { Page } from "@playwright/test";
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

/** Open a public menu without the welcome screen (it has its own test). */
export async function openMenu(page: Page, slug = "restaurant-demo") {
  await page.addInitScript((s) => sessionStorage.setItem(`rc-welcome-${s}`, "1"), slug);
  await page.goto(`/r/${slug}`);
}

/** A small real PNG (red square) for upload tests, generated in the browser. */
export async function pngBuffer(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 240;
    const g = c.getContext("2d")!;
    g.fillStyle = "#B24A26";
    g.fillRect(0, 0, 320, 240);
    g.fillStyle = "#E9B530";
    g.beginPath();
    g.arc(160, 120, 60, 0, Math.PI * 2);
    g.fill();
    return c.toDataURL("image/png").split(",")[1]!;
  });
  return Buffer.from(b64, "base64");
}

/** Run SQL against the e2e database (test setup only). */
export async function sql<T extends Record<string, unknown> = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const pool = new Pool({ connectionString: process.env.E2E_DATABASE_URL });
  try {
    return (await pool.query<T>(text, params)).rows;
  } finally {
    await pool.end();
  }
}

export async function seatToken(label: string, type = "table"): Promise<string> {
  const rows = await sql<{ qr_token: string }>(
    "select s.qr_token from seats s join restaurants r on r.id = s.restaurant_id where r.slug = 'restaurant-demo' and s.type = $1 and s.label = $2",
    [type, label],
  );
  return rows[0]!.qr_token;
}

/** Patch the demo restaurant's settings JSON (e.g. QR strategy, inactivity timings). */
export async function patchDemoSettings(patch: Record<string, unknown>) {
  await sql("update restaurants set settings = settings || $1::jsonb where slug = 'restaurant-demo'", [JSON.stringify(patch)]);
}

/** Close every open table session of the demo restaurant. */
export async function resetDemoSessions() {
  await sql(
    "update table_sessions set status = 'closed', closed_at = now(), closed_reason = 'staff' where status = 'open' and restaurant_id = (select id from restaurants where slug = 'restaurant-demo')",
  );
}

/** Delete every order of the demo restaurant, close its sessions, and put dishes back in stock. */
export async function resetDemoOrders() {
  await sql("delete from orders where restaurant_id = (select id from restaurants where slug = 'restaurant-demo')");
  await sql("update menu_items set sold_out_until = null where restaurant_id = (select id from restaurants where slug = 'restaurant-demo')");
  await resetDemoSessions();
}

/**
 * The dev owner may own 3 businesses: remove the ones earlier creation tests left (never the demo),
 * so each creation test starts with room for a new one.
 */
export async function freeDevOwnerSlots() {
  await sql(
    "delete from restaurants where slug <> 'restaurant-demo' and id in (select restaurant_id from members where clerk_user_id = 'dev-owner' and role = 'owner')",
  );
}
