import { expect, test, type Browser, type Page } from "@playwright/test";
import { patchDemoSettings, resetDemoOrders, seatToken, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

const DEMO = "(select id from restaurants where slug = 'restaurant-demo')";

async function orderAt(browser: Browser, table: string, dish: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => sessionStorage.setItem("rc-welcome-restaurant-demo", "1"));
  const p = await ctx.newPage();
  await p.goto(`/r/restaurant-demo/t/${await seatToken(table)}`);
  await expect(p.getByTestId("seat-badge")).toContainText(`Table ${table}`, { timeout: 25_000 });
  await p.getByTestId("menu-item").filter({ hasText: dish }).first().getByRole("button", { name: /^Ajouter/ }).click();
  await p.getByTestId("cart-bar").click();
  await p.getByTestId("send-order").click();
  await expect(p.getByTestId("my-order").first()).toBeVisible();
  return p;
}

test.beforeEach(async () => {
  await resetDemoOrders();
  await sql(`delete from staff_assignments where restaurant_id = ${DEMO}`);
  await patchDemoSettings({ orderValidation: "server_confirms", qrStrategy: "per_seat" });
});

test("the manager gives table 7 to someone; the customer asks for the bill; « Mes tables » shows it", async ({ browser, page }) => {
  test.slow();
  // Plan of the day: the first person on the list gets table 7.
  await page.goto("/app/staff/assignments");
  await expect(page.getByTestId("assignments")).toBeVisible();
  await page.getByTestId("assign-person").first().click();
  await page.getByTestId("assign-seat").and(page.locator('[data-label="7"]')).click();
  await page.getByTestId("assign-save").click();
  await expect(page.getByRole("status").filter({ hasText: "Enregistré" })).toBeVisible();
  await expect(page.getByTestId("assign-person").first()).toContainText("7");

  // A customer at table 7 orders, then asks for the bill.
  const phone = await orderAt(browser, "7", "Alloco");
  await expect(phone.getByTestId("ask-bill")).toBeVisible();
  await phone.getByTestId("ask-bill").click();
  await expect(phone.getByTestId("bill-asked")).toBeVisible();

  // « Mes tables »: the new order to confirm and the bill request, live.
  await page.goto("/app/tables");
  await expect(page.getByTestId("my-tables")).toBeVisible();
  await expect(page.getByTestId("my-bill").first()).toContainText("7");
  await expect(page.locator('[data-testid="my-table"][data-label="7"]')).toContainText("Addition demandée");
  await expect(page.getByTestId("my-to-confirm").first()).toContainText("7");
  await page.getByTestId("my-to-confirm").first().getByRole("button", { name: "Confirmer" }).click();
  await expect(page.getByTestId("my-to-confirm")).toHaveCount(0);
  await phone.context().close();
});

test("a server takes an order for a customer: table, dish with a note, sent to the kitchen", async ({ page }) => {
  await page.goto("/app/take");
  await expect(page.getByTestId("take-order")).toBeVisible();
  await page.getByTestId("take-seat").filter({ hasText: /^4$/ }).click();
  await page.getByTestId("take-search").fill("Alloco");
  await page.getByTestId("take-item").first().click();
  await expect(page.getByTestId("take-line")).toHaveCount(1);
  await page.getByTestId("take-line").first().getByRole("textbox").fill("sans piment");
  await page.getByTestId("take-send").click();
  await expect(page.getByTestId("take-done")).toContainText("envoyée en cuisine");
  // The kitchen has it, confirmed, with the note, taken by staff.
  const rows = await sql<{ source: string; status: string; seat_label: string; note: string | null }>(
    `select o.source, o.status, o.seat_label, i.note from orders o join order_items i on i.order_id = o.id where o.restaurant_id = ${DEMO} order by o.created_at desc limit 1`,
  );
  expect(rows[0]).toMatchObject({ source: "staff", status: "confirmed", seat_label: "4", note: "sans piment" });
});
