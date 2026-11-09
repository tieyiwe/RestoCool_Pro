import { expect, test } from "@playwright/test";
import { openMenu } from "./helpers";

const N = " ";

test("welcome screen greets the visitor, closes by itself, and does not come back in the same visit", async ({ page }) => {
  await page.goto("/r/restaurant-demo");
  await expect(page.getByTestId("welcome")).toContainText("Bienvenue au Restaurant Démo");
  await expect(page.getByTestId("welcome")).toBeHidden({ timeout: 5000 });
  await page.reload();
  await page.waitForTimeout(500);
  await expect(page.getByTestId("welcome")).toHaveCount(0);
});

test("search works in French, English and Chinese, and filters narrow the list", async ({ page }) => {
  await openMenu(page);
  const search = page.getByTestId("menu-search");
  await search.fill("chicken");
  await expect(page.getByTestId("dish-name").first()).toHaveText("Poulet bicyclette braisé");
  await search.fill("洛神花");
  await expect(page.getByTestId("dish-name")).toHaveText(["Jus de bissap"]);
  await search.fill("zzzz");
  await expect(page.getByText("Aucun plat ne correspond")).toBeVisible();
  await page.getByRole("button", { name: "Retirer les filtres" }).click();
  await page.getByRole("button", { name: /Pimenté/ }).click();
  const names = await page.getByTestId("menu-item").count();
  expect(names).toBeGreaterThan(0);
  for (const card of await page.getByTestId("menu-item").all()) await expect(card).toContainText("🌶️");
});

test("the language choice lasts for the visit only; a new visit is in French", async ({ page, browser }) => {
  await openMenu(page);
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByRole("link", { name: "Grills" })).toBeVisible();
  // Original names stay readable under the translation (for staff).
  await expect(page.getByTestId("menu-item").filter({ hasText: "Mixed salad" })).toContainText("Salade composée");
  await page.reload();
  await expect(page.getByRole("link", { name: "Grills" })).toBeVisible();
  const fresh = await browser.newPage();
  await fresh.goto(page.url());
  await expect(fresh.getByRole("link", { name: "Grillades" })).toBeVisible();
  await fresh.close();
});

test("Ma sélection: variants chooser, running total, steppers, back button closes the panel", async ({ page }) => {
  await openMenu(page);
  await page.getByTestId("menu-search").fill("champagne");
  await page.getByTestId("add-button").click();
  await page.getByTestId("variant-sheet").getByText("Magnum 1,5 L").click();
  await page.getByTestId("variant-confirm").click();
  await expect(page.getByTestId("cart-total")).toHaveText(`78${N}000${N}F`);
  await page.getByTestId("menu-search").fill("bissap");
  await page.getByTestId("add-button").click();
  await page.getByRole("button", { name: /Un de plus/ }).click();
  await expect(page.getByTestId("cart-total")).toHaveText(`79${N}000${N}F`);
  // « Sur demande » dish: added, but never counted as 0 F.
  await page.getByTestId("menu-search").fill("capitaine");
  await page.getByTestId("add-button").click();
  await expect(page.getByTestId("cart-total")).toHaveText(`79${N}000${N}F +`);

  await page.getByTestId("cart-bar").click();
  await expect(page.getByTestId("cart-sheet")).toBeVisible();
  await expect(page.getByTestId("cart-sheet")).toContainText("+ articles au prix sur demande");
  await page.goBack();
  await expect(page.getByTestId("cart-sheet")).toHaveCount(0);
  await expect(page).toHaveURL(/\/r\/restaurant-demo$/);
});

test("a selection of only « sur demande » dishes never shows 0 F; one back press closes a panel", async ({ page }) => {
  await openMenu(page);
  await page.getByTestId("menu-search").fill("capitaine");
  await page.getByTestId("add-button").click();
  await expect(page.getByTestId("cart-total")).toHaveText("Sur demande");
  await page.getByTestId("cart-bar").click();
  await expect(page.getByTestId("cart-sheet")).not.toContainText(`0${N}F`);
  await page.goBack();
  await expect(page.getByTestId("cart-sheet")).toHaveCount(0);
  // The panel used exactly one history entry: one more back leaves the menu.
  expect(await page.evaluate(() => (history.state as { rcPanel?: boolean } | null)?.rcPanel ?? false)).toBe(false);
});

test("opening a panel moves keyboard focus into it, closing it gives focus back", async ({ page }) => {
  await openMenu(page);
  await page.getByTestId("fortune-button").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("fortune-sheet")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("fortune-sheet")).toHaveCount(0);
  await expect(page.getByTestId("fortune-button")).toBeFocused();
});

test("a corrupted saved selection does not break the menu", async ({ page, request }) => {
  const { items } = (await (await request.get("/api/app/menu/items")).json()) as { items: Array<{ id: string }> };
  const realId = items[0]!.id;
  await page.addInitScript((id) => {
    sessionStorage.setItem("rc-welcome-restaurant-demo", "1");
    // A line for a real dish but without optionIds/qty, plus junk.
    sessionStorage.setItem("rc-cart-restaurant-demo", JSON.stringify([{ itemId: id }, null, { key: 1, itemId: id, qty: "lots" }]));
  }, realId);
  await page.goto("/r/restaurant-demo");
  await expect(page.getByTestId("menu-item")).toHaveCount(40);
  await expect(page.getByTestId("cart-bar")).toHaveCount(0);
});

test("takeaway by WhatsApp sends a prefilled French message with numbers and total", async ({ page, context }) => {
  // wa.me is not reachable from the test sandbox: answer it locally, we only check the URL.
  await context.route("https://wa.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "ok" }));
  await openMenu(page);
  await page.getByTestId("menu-search").fill("bissap");
  await page.getByTestId("add-button").click();
  await page.getByTestId("cart-bar").click();
  await page.getByRole("button", { name: /Commander à emporter/ }).click();
  await page.getByRole("button", { name: "Envoyer sur WhatsApp" }).click();
  await expect(page.getByText("Indiquez votre nom.")).toBeVisible();
  await page.getByLabel("Votre nom").fill("Awa");
  await page.getByLabel("Heure de retrait").fill("12:30");
  const popup = context.waitForEvent("page");
  await page.getByRole("button", { name: "Envoyer sur WhatsApp" }).click();
  const wa = await popup;
  const url = decodeURIComponent(wa.url());
  expect(url).toContain("wa.me/22670000001");
  expect(url).toContain("1 × 40. Jus de bissap");
  expect(url).toContain("Nom : Awa");
  expect(url).toContain("Retrait vers : 12:30");
});

test("photos: thumbnails open full screen and swipe; low-data mode hides all photos", async ({ page }) => {
  await openMenu(page);
  await page.getByTestId("menu-item").first().getByRole("button", { name: /Photo de/ }).click();
  const box = page.getByTestId("lightbox");
  await expect(box).toContainText("1 / ");
  await page.getByRole("button", { name: "Photo suivante" }).click();
  await expect(box).toContainText("2 / ");
  await page.keyboard.press("Escape");
  await expect(box).toHaveCount(0);

  await page.getByRole("button", { name: /Économie de données/ }).click();
  await expect(page.getByTestId("menu-item").locator("img")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("menu-item").locator("img")).toHaveCount(0); // remembered on this device
  await page.getByRole("button", { name: /Économie de données/ }).click();
});

test("contact shows open/closed, call links, mobile money numbers; fortune cookie opens", async ({ page }) => {
  await openMenu(page);
  await expect(page.getByTestId("open-status")).toHaveText(/Ouvert|Fermé/);
  const contact = page.locator("#contact");
  await expect(contact.getByRole("link", { name: "+226 70 00 00 01" })).toHaveAttribute("href", "tel:+22670000001");
  await expect(contact).toContainText("Orange Money");
  await expect(contact.locator("svg").first()).toBeAttached(); // WhatsApp QR
  await page.getByTestId("fortune-button").click();
  await expect(page.getByTestId("fortune-sheet")).toContainText("«");
});

test("a dish marked « épuisé aujourd'hui » in the manager shows as sold out and cannot be added", async ({ page }) => {
  await page.goto("/app/menu");
  const row = page.getByTestId("admin-item").filter({ hasText: "Salade composée" });
  await row.getByRole("button", { name: "Marquer épuisé" }).click();
  await expect(row).toContainText("Épuisé aujourd’hui");
  await openMenu(page);
  const card = page.getByTestId("menu-item").filter({ hasText: "Salade composée" });
  await expect(card).toContainText("Épuisé aujourd’hui");
  await expect(card.getByTestId("add-button")).toHaveCount(0);
  await page.goto("/app/menu");
  const again = page.getByTestId("admin-item").filter({ hasText: "Salade composée" });
  await again.getByRole("button", { name: "Remettre en vente" }).click();
  await expect(again.getByRole("button", { name: "Marquer épuisé" })).toBeVisible();
});

test("installable: manifest and service worker are served", async ({ request }) => {
  const m = await request.get("/r/restaurant-demo/manifest.webmanifest");
  expect(m.ok()).toBe(true);
  expect(await m.json()).toMatchObject({ start_url: "/r/restaurant-demo", scope: "/r/", display: "standalone" });
  const sw = await request.get("/r/sw.js");
  expect(sw.headers()["service-worker-allowed"]).toBe("/r/");
  expect(await sw.text()).toContain("networkFirst");
});
