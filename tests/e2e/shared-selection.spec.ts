import { expect, test, type Browser, type Page } from "@playwright/test";
import { patchDemoSettings, resetDemoOrders, seatToken, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

const skipWelcome = "sessionStorage.setItem('rc-welcome-restaurant-demo', '1')";
const DEMO = "(select id from restaurants where slug = 'restaurant-demo')";

async function phone(browser: Browser, url: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(skipWelcome);
  // No share sheet in the test browser: the WhatsApp fallback opens a tab we ignore.
  await ctx.addInitScript("Object.defineProperty(navigator, 'share', { value: undefined }); window.open = () => null;");
  const p = await ctx.newPage();
  await p.goto(url);
  return p;
}
const add = (p: Page, dish: string) => p.getByTestId("menu-item").filter({ hasText: dish }).first().getByRole("button", { name: /^Ajouter/ }).click();

test.beforeEach(async () => {
  await resetDemoOrders();
  await sql(`delete from shared_carts where restaurant_id = ${DEMO}`);
  await patchDemoSettings({ orderValidation: "direct", qrStrategy: "per_seat" });
});

test("the host shares the selection by link; a friend gives a name first, adds dishes and says done; only the host sends one order with everyone's names", async ({ browser, page }) => {
  test.slow();
  const host = await phone(browser, `/r/restaurant-demo/t/${await seatToken("4")}`);
  await expect(host.getByTestId("seat-badge")).toContainText("Table 4", { timeout: 25_000 });
  await add(host, "Alloco");
  await host.getByTestId("cart-bar").click();
  await host.getByTestId("share-start").click();
  // A name is required to share.
  await host.getByTestId("share-host-name").fill("");
  await expect(host.getByTestId("share-create")).toBeDisabled();
  await host.getByTestId("share-host-name").fill("Awa");
  await host.getByTestId("share-create").click();
  await expect(host.getByTestId("share-live")).toBeVisible();

  expect(await sql(`select 1 from shared_carts where restaurant_id = ${DEMO} and status = 'open'`)).toHaveLength(1);
  const url = await host.evaluate(() => `${location.pathname.replace(/\/t\/.*/, "")}?partage=${localStorage.getItem("rc-share-restaurant-demo")}`);

  // The friend opens the link: name first, before anything can be added.
  const friend = await phone(browser, url);
  await expect(friend.getByTestId("guest-name-gate")).toBeVisible({ timeout: 25_000 });
  await expect(friend.getByTestId("guest-name-gate")).toContainText("Awa");
  await expect(friend.getByTestId("guest-name-ok")).toBeDisabled();
  await friend.getByTestId("guest-name").fill("Moussa");
  await friend.getByTestId("guest-name-ok").click();
  await expect(friend.getByTestId("guest-name-gate")).toHaveCount(0);
  await expect(friend.getByTestId("guest-banner")).toContainText("Moussa");
  await add(friend, "Brochettes de foie");
  await friend.getByTestId("cart-bar").click();
  // The friend sees the host's dishes with the host's name, and has no send / place / takeaway controls.
  await expect(friend.getByTestId("share-member").filter({ hasText: "Awa" })).toContainText("Alloco");
  await expect(friend.getByTestId("send-order")).toHaveCount(0);
  await expect(friend.getByTestId("order-mode")).toHaveCount(0);
  await friend.getByTestId("guest-finish").click();
  await expect(friend.getByTestId("guest-done")).toBeVisible();

  // The host sees Moussa's dishes, marked done, in the total; then sends one order.
  const moussa = host.getByTestId("share-member").filter({ hasText: "Moussa" });
  await expect(moussa).toContainText("Brochettes de foie", { timeout: 15_000 });
  await expect(moussa).toHaveAttribute("data-done", "true");
  await host.getByTestId("send-order").click();
  await expect(host.getByTestId("my-order").first()).toBeVisible();

  const items = await sql<{ note: string | null; fr: string }>(
    `select oi.note, oi.name_snapshot->>'fr' as fr from order_items oi join orders o on o.id = oi.order_id where o.restaurant_id = ${DEMO} order by fr`,
  );
  expect(items).toEqual([
    { fr: "Alloco", note: "Awa" },
    { fr: "Brochettes de foie", note: "Moussa" },
  ]);
  // The friend's phone says the host confirmed it.
  await expect(friend.getByTestId("guest-banner")).toContainText("Awa a confirmé la commande", { timeout: 15_000 });

  // Console: the overview and the business page count it.
  await page.goto("/admin_pro");
  await expect(page.getByTestId("feature-usage")).toBeVisible();
  expect(Number(await page.getByTestId("fu-shared-sent").locator("span").last().innerText())).toBeGreaterThanOrEqual(1);
  const [{ id }] = await sql<{ id: string }>(`select id from restaurants where slug = 'restaurant-demo'`);
  await page.goto(`/admin_pro/businesses/${id}`);
  await expect(page.getByTestId("fu-shared-sent")).toContainText("1");
  await expect(page.getByTestId("fu-shared-guests")).toContainText("1");
});
