import { expect, test, type Browser, type Page } from "@playwright/test";
import { patchDemoSettings, resetDemoOrders, seatToken, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

const DEMO = "(select id from restaurants where slug = 'restaurant-demo')";

async function orderAt(browser: Browser, table: string, dish: string, times = 1): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => sessionStorage.setItem("rc-welcome-restaurant-demo", "1"));
  const p = await ctx.newPage();
  await p.goto(`/r/restaurant-demo/t/${await seatToken(table)}`);
  await expect(p.getByTestId("seat-badge")).toContainText(`Table ${table}`, { timeout: 25_000 });
  for (let i = 0; i < times; i++) await p.getByTestId("menu-item").filter({ hasText: dish }).first().getByRole("button", { name: /^Ajouter/ }).click();
  await p.getByTestId("cart-bar").click();
  await p.getByTestId("send-order").click();
  await expect(p.getByTestId("my-order").first()).toBeVisible();
  return p;
}

test.beforeEach(async () => {
  await resetDemoOrders();
  await sql(`delete from payments where restaurant_id = ${DEMO}`);
  await sql(`delete from payment_intents where restaurant_id = ${DEMO}`);
  await sql(`delete from bills where restaurant_id = ${DEMO}`);
  await patchDemoSettings({ orderValidation: "direct", qrStrategy: "per_seat" });
});

test("collect cash with change, print the receipt; the customer's phone shows « Payée »; the table frees itself", async ({ browser, page }) => {
  test.slow();
  const phone = await orderAt(browser, "6", "Alloco"); // 1 000 F
  // The board offers « Encaisser » on the card.
  await page.goto("/app/service");
  await expect(page.getByTestId("action-pay").first()).toBeVisible();
  // The register lists table 6.
  await page.goto("/app/cashier");
  const bill = page.getByTestId("cashier-bill").filter({ hasText: "Table 6" });
  await expect(bill).toContainText(/1\s000/);
  await bill.getByTestId("cashier-collect").click();
  await expect(page.getByTestId("pay-screen")).toBeVisible();
  await expect(page.getByTestId("pay-due")).toContainText(/1\s000/);
  await page.getByTestId("pay-method-cash").click();
  await page.getByTestId("pay-received").fill("5000");
  await expect(page.getByTestId("pay-change-preview")).toContainText(/4\s000/);
  await page.getByTestId("pay-submit").click();
  await expect(page.getByTestId("pay-done")).toBeVisible();
  await expect(page.getByTestId("pay-change")).toContainText(/4\s000/);
  // Receipt.
  await page.getByTestId("pay-receipt").click();
  await expect(page.getByTestId("receipt")).toContainText("Alloco");
  await expect(page.getByTestId("receipt-total")).toContainText(/1\s000/);
  await expect(page.getByTestId("receipt-whatsapp")).toHaveAttribute("href", /wa\.me/);
  // The customer sees « Payée »; the table is free.
  await phone.reload();
  await phone.getByTestId("my-orders-button").click().catch(() => {});
  await expect(phone.getByTestId("my-order").first()).toHaveAttribute("data-status", "paid", { timeout: 15_000 });
  // The paid table session closed itself (a phone still on the table's page opens a new one).
  expect(await sql(`select 1 from table_sessions t join seats s on s.id = t.seat_id where t.restaurant_id = ${DEMO} and s.label = '6' and t.closed_reason = 'paid' and t.closed_at > now() - interval '1 minute'`)).not.toHaveLength(0);
  await phone.context().close();
});

test("split in two: Orange Money needs its reference, then cash; the closing adds it up and exports a CSV", async ({ browser, page, request }) => {
  test.slow();
  const phone = await orderAt(browser, "7", "Alloco"); // 1 000 F
  await page.goto("/app/cashier");
  await page.getByTestId("cashier-bill").filter({ hasText: "Table 7" }).getByTestId("cashier-collect").click();
  await page.getByTestId("pay-mode-parts").click();
  await expect(page.getByTestId("pay-parts")).toHaveText("2");
  await page.getByTestId("pay-method-orange_money").click();
  await expect(page.getByTestId("pay-submit")).toBeDisabled(); // reference required
  await page.getByTestId("pay-reference").fill("PP231117.1234");
  await page.getByTestId("pay-submit").click();
  await expect(page.getByTestId("pay-history")).toContainText("PP231117.1234");
  await expect(page.getByTestId("pay-due")).toContainText(/500/);
  await page.getByTestId("pay-method-cash").click();
  await page.getByTestId("pay-submit").click();
  await expect(page.getByTestId("pay-done")).toBeVisible();

  await page.goto("/app/closing");
  await expect(page.getByTestId("closing-total")).toContainText(/1\s000/);
  await expect(page.getByTestId("closing-cashInDrawer")).toContainText(/500/);
  await expect(page.getByTestId("closing-methods")).toContainText("Orange Money");
  const csv = await request.get("/api/app/closing/export");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const body = await csv.text();
  expect(body).toContain("Orange Money");
  expect(body).toContain("Espèces");
  await phone.context().close();
});
