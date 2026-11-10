import { expect, test, type Browser, type Page } from "@playwright/test";
import { patchDemoSettings, resetDemoOrders, seatToken, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

const skipWelcome = "sessionStorage.setItem('rc-welcome-restaurant-demo', '1')";

test.beforeEach(async () => {
  await resetDemoOrders();
  await patchDemoSettings({ orderValidation: "server_confirms", qrStrategy: "per_seat" });
});

async function phoneAt(browser: Browser, table: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(skipWelcome);
  const p = await ctx.newPage();
  await p.goto(`/r/restaurant-demo/t/${await seatToken(table)}`);
  await expect(p.getByTestId("seat-badge")).toContainText(`Table ${table}`, { timeout: 25_000 });
  return p;
}

const dish = (p: Page, name: string) => p.getByTestId("menu-item").filter({ hasText: name });

async function order(p: Page, dishes: string[], note?: string) {
  for (const d of dishes) await dish(p, d).getByRole("button", { name: /^Ajouter/ }).click();
  await p.getByTestId("cart-bar").click();
  if (note) {
    await p.getByTestId("add-note").first().click();
    await p.getByTestId("line-note").fill(note);
    await p.getByTestId("line-note").press("Enter");
  }
  await p.getByTestId("send-order").click();
  await expect(p.getByTestId("orders-sheet")).toBeVisible();
}

test("a table orders; front desk, kitchen and the customer's phone follow it live to « servie »", async ({ browser, page }) => {
  test.slow();
  await page.goto("/app/service");
  await expect(page.getByTestId("live-status")).toContainText("En direct");

  const phone = await phoneAt(browser, "4");
  await order(phone, ["Alloco", "Jus de bissap"], "sans piment");
  await expect(phone.getByTestId("my-order").first()).toHaveAttribute("data-status", "sent");

  // Front desk: the order appears without reloading, with the seat badge and the note.
  const card = page.getByTestId("col-new").getByTestId("order-card");
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId("seat-big")).toHaveText("4");
  await expect(card).toContainText("« sans piment »");
  await expect(card).toContainText("1 500 F"); // 1 000 + 500, priced by the server
  await card.getByTestId("action-confirmed").click();
  await expect(phone.getByTestId("my-order").first()).toHaveAttribute("data-status", "confirmed");

  // Kitchen: tap one dish (order starts), then « Tout est prêt ».
  const kds = await page.context().newPage();
  await kds.goto("/app/kitchen");
  const kcard = kds.getByTestId("kds-card");
  await expect(kcard).toHaveCount(1);
  await kcard.getByTestId("kds-item").first().click();
  await expect(phone.getByTestId("my-order").first()).toHaveAttribute("data-status", "preparing");
  await kcard.getByTestId("kds-all-ready").click();
  await expect(kds.getByTestId("kds-waiting")).toBeVisible();

  await page.getByTestId("col-ready").getByTestId("action-served").click();
  await expect(phone.getByTestId("served")).toContainText("Vous avez été servi");

  // « Montrer au serveur »: big seat badge and a QR that opens the order in the staff app.
  await phone.getByTestId("served").click();
  await phone.getByTestId("show-server").first().click();
  await expect(phone.getByTestId("server-seat")).toHaveText("Table 4");
  const qr = phone.getByTestId("server-view").locator("img");
  await expect.poll(() => qr.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const [o] = await sql<{ id: string }>("select id from orders where restaurant_id = (select id from restaurants where slug = 'restaurant-demo')");
  await page.goto(`/app/orders/${o!.id}`);
  await expect(page.getByTestId("order-card")).toHaveAttribute("data-status", "served");
  await phone.context().close();
});

test("group ordering: two phones at one table share the bill; others see nothing", async ({ browser }) => {
  const a = await phoneAt(browser, "6");
  await order(a, ["Frites"]);
  const b = await phoneAt(browser, "6");
  await order(b, ["Jus de gingembre"]);
  await expect(b.getByTestId("table-bill")).toContainText("1 500 F");
  await expect(b.getByTestId("my-order")).toHaveCount(2);
  await expect(b.getByTestId("my-order").filter({ hasText: "de la table" })).toHaveCount(1);
  // Phone A (its orders panel still open) sees phone B's order arrive live.
  await expect(a.getByTestId("orders-sheet").getByTestId("my-order")).toHaveCount(2);
  // A phone at another table sees none of it.
  const c = await phoneAt(browser, "8");
  const res = await c.request.get(`/api/public/orders?slug=restaurant-demo&deviceId=someOtherPhone000000`);
  expect((await res.json()).orders).toHaveLength(0);
  for (const p of [a, b, c]) await p.context().close();
});

test("« Épuisé » in one tap shows on the customer's menu without reloading, and the order is refused", async ({ browser, page }) => {
  const phone = await phoneAt(browser, "9");
  await order(phone, ["Dégué"]); // seated with an order: the phone is listening live
  await phone.getByTestId("orders-sheet").getByRole("button", { name: "Fermer" }).click();
  await dish(phone, "Salade de fruits").getByRole("button", { name: /^Ajouter/ }).click();

  await page.goto("/app/kitchen");
  await page.getByTestId("open-sold-out").click();
  await page.getByTestId("sold-out-panel").getByPlaceholder("Rechercher").fill("Salade de fruits");
  await page.getByTestId("sold-out-toggle").check();

  await expect(dish(phone, "Salade de fruits")).toContainText("Épuisé");
  await phone.getByTestId("cart-bar").click();
  await phone.getByTestId("send-order").click();
  await expect(phone.getByRole("status").filter({ hasText: "vient d’être épuisé" })).toBeVisible();
  await expect(phone.getByTestId("cart-sheet")).not.toContainText("Salade de fruits");
  await phone.context().close();
});

test("cancel needs a reason; the customer sees « Annulée »", async ({ browser, page }) => {
  const phone = await phoneAt(browser, "5");
  await order(phone, ["Alloco"]);
  await page.goto("/app/service");
  const card = page.getByTestId("col-new").getByTestId("order-card");
  await card.getByTestId("action-cancel").click();
  await card.getByRole("button", { name: "Plat épuisé" }).click();
  await card.getByRole("button", { name: "Annuler la commande" }).click();
  await expect(phone.getByTestId("my-order").first()).toHaveAttribute("data-status", "cancelled");
  await expect(phone.getByTestId("my-order").first()).toContainText("Plat épuisé");
  await phone.context().close();
});

test("previous selections: a new visit starts empty and offers the last order again", async ({ browser }) => {
  const phone = await phoneAt(browser, "3");
  await order(phone, ["Tô sauce gombo"]);
  // New visit = new tab (sessionStorage is per tab); localStorage keeps the history.
  const again = await phone.context().newPage();
  await again.goto(`/r/restaurant-demo`);
  await again.evaluate(() => sessionStorage.setItem("rc-welcome-restaurant-demo", "1"));
  await again.reload();
  await expect(again.getByTestId("cart-bar")).toHaveCount(0);
  await again.getByTestId("my-orders-button").click();
  await again.getByTestId("orders-sheet").getByRole("button", { name: "Fermer" }).click();
  await dish(again, "Frites").getByRole("button", { name: /^Ajouter/ }).click();
  await again.getByTestId("cart-bar").click();
  await again.getByTestId("history-link").click();
  const entry = again.getByTestId("history-entry").filter({ hasText: "Commande n°" });
  await expect(entry).toContainText("Tô sauce gombo");
  await entry.getByRole("button", { name: "Reprendre" }).click();
  await expect(again.getByTestId("cart-sheet")).toContainText("Tô sauce gombo");
  await expect(again.getByTestId("cart-sheet")).toContainText("Frites");
  await phone.context().close();
});

test("staff can never read or change another restaurant's orders", async ({ page, request }) => {
  const [r] = await sql<{ id: string }>("select id from restaurants where slug = 'maquis-temoin'");
  const [o] = await sql<{ id: string }>(
    "insert into orders (restaurant_id, business_date, number, validation_mode, status) values ($1, current_date, 999, 'direct', 'confirmed') returning id",
    [r!.id],
  );
  try {
    expect((await request.get(`/api/app/orders/${o!.id}`)).status()).toBe(404);
    expect((await request.post(`/api/app/orders/${o!.id}/status`, { data: { to: "served" } })).status()).toBe(404);
    const list = await (await request.get("/api/app/orders")).json();
    expect(list.orders.some((x: { id: string }) => x.id === o!.id)).toBe(false);
    const res = await page.goto(`/app/orders/${o!.id}`);
    expect(res?.status()).toBe(404);
    const [still] = await sql<{ status: string }>("select status from orders where id = $1", [o!.id]);
    expect(still!.status).toBe("confirmed");
  } finally {
    await sql("delete from orders where id = $1", [o!.id]);
  }
});
