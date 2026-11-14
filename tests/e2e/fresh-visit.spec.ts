import { expect, test } from "@playwright/test";
import { openMenu, patchDemoSettings, resetDemoOrders, seatToken, sql } from "./helpers";

test("coming back after a while starts fresh: empty cart, place to choose again, last selection kept in « Sélections précédentes »", async ({ page }) => {
  await openMenu(page, "shangri-la");
  await page.getByTestId("add-button").first().click();
  await page.getByTestId("add-button").nth(1).click();
  await expect(page.getByTestId("cart-total")).toBeVisible();
  // Same visit (a reload a minute later): the cart is still there.
  await page.reload();
  await expect(page.getByTestId("cart-total")).toBeVisible();
  // Leaves (another page in the same tab), comes back 3 hours later.
  await page.goto("/restaurants");
  await page.evaluate(() => localStorage.setItem("rc-lastseen-shangri-la", String(Date.now() - 3 * 60 * 60 * 1000)));
  await page.goto("/r/shangri-la");
  await expect(page.getByTestId("cart-bar")).toHaveCount(0);
  await expect(page.getByTestId("choose-seat")).toBeVisible();
  // Nothing lost: the previous selection can be reused.
  await page.getByTestId("add-button").first().click();
  await page.getByTestId("cart-bar").click();
  await page.getByTestId("history-link").click();
  await expect(page.getByTestId("history-entry").first()).toBeVisible();
});

test("an old order nobody picked up never comes back as « en cours », and does not hold the table", async ({ browser }) => {
  test.slow();
  await resetDemoOrders();
  await patchDemoSettings({ orderValidation: "server_confirms", qrStrategy: "per_seat" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => sessionStorage.setItem("rc-welcome-restaurant-demo", "1"));
  const page = await ctx.newPage();
  await page.goto(`/r/restaurant-demo/t/${await seatToken("8")}`);
  await expect(page.getByTestId("seat-badge")).toContainText("Table 8", { timeout: 25_000 });
  await page.getByTestId("menu-item").filter({ hasText: "Alloco" }).getByRole("button", { name: /^Ajouter/ }).click();
  await page.getByTestId("cart-bar").click();
  await page.getByTestId("send-order").click();
  await expect(page.getByTestId("my-order").first()).toHaveAttribute("data-status", "sent");
  // « Envoyée » is now said plainly: waiting for the business.
  await expect(page.getByTestId("my-order").first()).toContainText("En attente de l’établissement");

  // 3 hours later, nobody at the business touched it: the sweep closes it and frees table 8.
  const DEMO = "(select id from restaurants where slug = 'restaurant-demo')";
  await sql(`update orders set updated_at = now() - interval '3 hours', sent_at = now() - interval '3 hours' where restaurant_id = ${DEMO} and seat_label = '8'`);
  await sql(`update table_sessions set last_activity_at = now() - interval '3 hours' where restaurant_id = ${DEMO} and status = 'open'`);
  await page.evaluate(() => localStorage.setItem("rc-lastseen-restaurant-demo", String(Date.now() - 3 * 60 * 60 * 1000)));
  await page.goto("/r/restaurant-demo");
  // Fresh start: no « Mes commandes » bar pulling the customer back to the old order.
  await expect(page.getByTestId("menu-item").first()).toBeVisible();
  await expect(page.getByTestId("orders-bar")).toHaveCount(0);
  // The phone reads its orders: the sweep closes the one nobody picked up and says why.
  await expect.poll(async () => (await sql<{ status: string; cancelled_reason: string }>(`select status, cancelled_reason from orders where restaurant_id = ${DEMO} and seat_label = '8'`))[0]).toEqual({ status: "cancelled", cancelled_reason: "system:unhandled" });
  await page.getByTestId("my-orders-button").click();
  await expect(page.getByTestId("my-order-cancel-reason").first()).toContainText("Non prise en charge");
  expect(await sql(`select 1 from table_sessions t join seats s on s.id = t.seat_id where t.restaurant_id = ${DEMO} and s.label = '8' and t.status = 'open'`)).toHaveLength(0);
  await ctx.close();
});
