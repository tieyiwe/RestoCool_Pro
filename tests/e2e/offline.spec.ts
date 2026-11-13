import { expect, test, type Browser, type Page } from "@playwright/test";
import { patchDemoSettings, resetDemoOrders, seatToken, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

const skipWelcome = "sessionStorage.setItem('rc-welcome-restaurant-demo', '1')";

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
  await patchDemoSettings({ orderValidation: "server_confirms", qrStrategy: "per_seat" });
});

test("customer offline: « Hors ligne » banner, the order waits on the phone, then leaves by itself when the network is back", async ({ browser, page }) => {
  test.slow();
  const phone = await phoneAt(browser, "8");
  await phone.context().setOffline(true);
  const banner = phone.getByTestId("offline-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Hors ligne");
  await expect(banner).toContainText("Vérifiez votre connexion Internet");

  // The menu still works; the order is kept.
  await phone.getByTestId("menu-item").filter({ hasText: "Alloco" }).getByRole("button", { name: /^Ajouter/ }).click();
  await phone.getByTestId("cart-bar").click();
  await phone.getByTestId("send-order").click();
  const pending = phone.getByTestId("pending-order");
  await expect(pending).toBeVisible();
  await expect(pending).toHaveAttribute("data-state", "waiting");
  await expect(pending).toContainText("Alloco");
  expect(await sql("select id from orders where restaurant_id = (select id from restaurants where slug = 'restaurant-demo') and seat_label = '8'")).toHaveLength(0);

  // Network back: « De nouveau en ligne », the order is sent once, the restaurant sees it.
  await phone.context().setOffline(false);
  await expect(phone.getByTestId("online-again")).toBeVisible();
  await expect(phone.getByTestId("pending-order")).toHaveCount(0, { timeout: 20_000 });
  await expect(phone.getByTestId("my-order").first()).toHaveAttribute("data-status", "sent");
  await page.goto("/app/service");
  await expect(page.getByTestId("order-card").filter({ has: page.getByTestId("seat-big").filter({ hasText: /^8$/ }) })).toHaveCount(1);
  expect(await sql("select id from orders where restaurant_id = (select id from restaurants where slug = 'restaurant-demo') and seat_label = '8'")).toHaveLength(1);
  await phone.context().close();
});

test("staff offline: the board keeps the last orders, a « Confirmer » waits (« en attente ») and is sent when the network is back", async ({ browser, page, context }) => {
  test.slow();
  const phone = await phoneAt(browser, "2");
  await phone.getByTestId("menu-item").filter({ hasText: "Alloco" }).getByRole("button", { name: /^Ajouter/ }).click();
  await phone.getByTestId("cart-bar").click();
  await phone.getByTestId("send-order").click();
  await expect(phone.getByTestId("my-order").first()).toHaveAttribute("data-status", "sent");

  await page.goto("/app/service");
  const card = page.getByTestId("order-card").filter({ has: page.getByTestId("seat-big").filter({ hasText: /^2$/ }) });
  await expect(card).toHaveCount(1);
  await context.setOffline(true);
  await expect(page.getByTestId("offline-banner")).toContainText("Vérifiez votre connexion Internet");
  await card.getByTestId("action-confirmed").click();
  await expect(card.getByTestId("order-waiting")).toBeVisible();
  await expect(card).toHaveAttribute("data-status", "confirmed");
  const [before] = await sql<{ status: string }>("select status from orders where seat_label = '2' and restaurant_id = (select id from restaurants where slug = 'restaurant-demo') order by sent_at desc limit 1");
  expect(before!.status).toBe("sent");

  await context.setOffline(false);
  await expect(card.getByTestId("order-waiting")).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(async () => (await sql<{ status: string }>("select status from orders where seat_label = '2' and restaurant_id = (select id from restaurants where slug = 'restaurant-demo') order by sent_at desc limit 1"))[0]!.status, { timeout: 20_000 }).toBe("confirmed");
  await expect(phone.getByTestId("my-order").first()).toHaveAttribute("data-status", "confirmed", { timeout: 20_000 });
  await phone.context().close();
});

test("a new version published: the owner on a computer gets « Mettre à jour »; a phone reloads by itself", async ({ page, browser }) => {
  test.slow();
  const fakeNew = (p: Page) => p.route("**/api/version", (r) => r.fulfill({ json: { v: "new-version" } }));
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await fakeNew(page);
    await page.goto("/app");
    const popup = page.getByTestId("update-popup");
    await expect(popup).toBeVisible();
    await expect(popup).toContainText("Nouvelle version disponible");
    const reloaded = page.waitForEvent("load");
    await popup.getByTestId("update-now").click();
    await reloaded;
  } else {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(skipWelcome);
    const phone = await ctx.newPage();
    await fakeNew(phone);
    await phone.goto("/r/restaurant-demo");
    await expect(phone.getByTestId("update-popup")).toHaveCount(0);
    // No touch for 20 s: the page reloads by itself (the cart and the seat are kept).
    await phone.waitForEvent("load", { timeout: 45_000 });
    await ctx.close();
  }
});
