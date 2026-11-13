import { expect, test, type Browser, type Page } from "@playwright/test";
import { patchDemoSettings, resetDemoOrders, seatToken, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

const skipWelcome = "sessionStorage.setItem('rc-welcome-restaurant-demo', '1')";
const DEMO = "(select id from restaurants where slug = 'restaurant-demo')";

async function phoneAt(browser: Browser, table: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(skipWelcome);
  const p = await ctx.newPage();
  await p.goto(`/r/restaurant-demo/t/${await seatToken(table)}`);
  await expect(p.getByTestId("seat-badge")).toContainText(`Table ${table}`, { timeout: 25_000 });
  return p;
}

test.beforeEach(async () => {
  await resetDemoOrders();
  await sql(`delete from reviews where restaurant_id = ${DEMO}`);
  await patchDemoSettings({ orderValidation: "direct", qrStrategy: "per_seat" });
  await sql(`update restaurants set settings = jsonb_set(settings, '{features,reviews}', 'true', true) where id = ${DEMO}`);
});

test("a served customer gives 4 stars and a comment; the stars show on the page and in the directory; the owner hides, shows, deletes; the console keeps it", async ({ browser, page }) => {
  test.slow();
  const phone = await phoneAt(browser, "9");
  await phone.getByTestId("menu-item").filter({ hasText: "Alloco" }).getByRole("button", { name: /^Ajouter/ }).click();
  await phone.getByTestId("cart-bar").click();
  await phone.getByTestId("send-order").click();
  await expect(phone.getByTestId("my-order").first()).toBeVisible();
  // No review before being served.
  await expect(phone.getByTestId("review-open")).toHaveCount(0);
  await sql(`update orders set status = 'served', served_at = now() where restaurant_id = ${DEMO} and seat_label = '9'`);
  await phone.reload();
  await phone.getByTestId("my-orders-button").click();
  await phone.getByTestId("review-open").click();
  await expect(phone.getByTestId("review-send")).toBeDisabled(); // stars are required
  await phone.getByTestId("review-star-4").click();
  await phone.getByTestId("review-comment").fill("Alloco croustillant, service rapide.");
  await phone.getByTestId("review-name").fill("Awa");
  await phone.getByTestId("review-send").click();
  await expect(phone.getByTestId("review-thanks")).toBeVisible();

  // Star rating next to the name, and the review in « Avis clients ».
  await phone.reload();
  await expect(phone.getByTestId("header-rating")).toContainText("4.0");
  await expect(phone.getByTestId("reviews-section")).toContainText("Alloco croustillant");
  await expect(phone.getByTestId("reviews-section")).toContainText("Awa");
  // Once per order: no second form for it.
  await phone.getByTestId("my-orders-button").click();
  await expect(phone.getByTestId("review-open")).toHaveCount(0);

  // The directory card shows the stars too.
  await page.goto("/restaurants?q=Restaurant%20D%C3%A9mo");
  await expect(page.getByTestId("directory-card").filter({ hasText: "Restaurant Démo" }).getByTestId("directory-rating")).toContainText("4.0");

  // Owner: hide → gone from the page; show again; delete (confirmed) → gone from the list too.
  await page.goto("/app/reviews");
  const row = page.getByTestId("review-row").filter({ hasText: "Alloco croustillant" });
  await expect(row).toHaveAttribute("data-status", "visible");
  await row.getByTestId("review-hide").click();
  await expect(page.getByTestId("reviews-ok")).toBeVisible();
  await expect(page.getByTestId("review-row").filter({ hasText: "Alloco croustillant" })).toHaveAttribute("data-status", "hidden");
  await phone.reload();
  await expect(phone.getByTestId("reviews-section")).toHaveCount(0);
  await expect(phone.getByTestId("header-rating")).toHaveCount(0);
  await page.getByTestId("review-row").filter({ hasText: "Alloco croustillant" }).getByTestId("review-show").click();
  await expect(page.getByTestId("review-row").filter({ hasText: "Alloco croustillant" })).toHaveAttribute("data-status", "visible");
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("review-row").filter({ hasText: "Alloco croustillant" }).getByTestId("review-delete").click();
  await expect(page.getByTestId("review-row").filter({ hasText: "Alloco croustillant" })).toHaveCount(0);
  await phone.reload();
  await expect(phone.getByTestId("reviews-section")).toHaveCount(0);

  // Console: the deleted review is still there, marked « deleted by the business ».
  await page.goto("/admin_pro/reviews?status=deleted");
  const kept = page.getByTestId("admin-review").filter({ hasText: "Alloco croustillant" });
  await expect(kept).toHaveAttribute("data-status", "deleted");
  await expect(kept).toContainText("Restaurant Démo");
  await expect(page.getByTestId("admin-reviews-deleted")).not.toContainText(/^0$/);
  await phone.context().close();
});

test("the owner switches reviews off: no section, no form; back on, everything returns", async ({ browser, page }) => {
  const [o] = await sql<{ id: string }>(`insert into orders (restaurant_id, business_date, number, status, validation_mode, customer_device_id, seat_type, seat_label) values (${DEMO}, current_date, 990, 'served', 'direct', 'phoneE2EREVIEWAAAAAAA', 'table', '9') returning id`);
  await sql(`insert into reviews (restaurant_id, order_id, device_hash, rating, comment) values (${DEMO}, $1, 'x', 5, 'Parfait')`, [o!.id]);
  await page.goto("/app/reviews");
  await page.getByTestId("reviews-toggle-button").click();
  await expect(page.getByTestId("reviews-toggle")).toContainText("⚪");
  const phone = await phoneAt(browser, "9");
  await expect(phone.getByTestId("reviews-section")).toHaveCount(0);
  await expect(phone.getByTestId("header-rating")).toHaveCount(0);
  await page.getByTestId("reviews-toggle-button").click();
  await expect(page.getByTestId("reviews-toggle")).toContainText("🟢");
  await phone.reload();
  await expect(phone.getByTestId("reviews-section")).toContainText("Parfait");
  await phone.context().close();
});
