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
