import { expect, test } from "@playwright/test";
import { openMenu, patchDemoSettings, resetDemoOrders, sql } from "./helpers";

test("takeaway on the platform: name and phone are required, staff see them with the full order number, date and time", async ({ page, browser }) => {
  await resetDemoOrders();
  await patchDemoSettings({ orderValidation: "server_confirms", qrStrategy: "per_seat" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await ctx.newPage();
  await openMenu(phone);
  await phone.getByTestId("menu-search").fill("bissap");
  await phone.getByTestId("add-button").click();
  await phone.getByTestId("choose-seat").click();
  await phone.getByTestId("seat-picker").getByRole("button", { name: /À emporter/ }).click();
  await expect(phone.getByTestId("seat-badge")).toContainText("À emporter");
  await phone.getByTestId("cart-bar").click();
  // The details: name + phone required, pickup time optional. WhatsApp is only a second way.
  await expect(phone.getByTestId("order-details")).toContainText("un numéro où l’établissement peut vous joindre");
  await expect(phone.getByRole("button", { name: /Ou commander à emporter par WhatsApp/ })).toBeVisible();
  await phone.getByTestId("details-name").fill("Awa Ouédraogo");
  await phone.getByTestId("send-order").click();
  await expect(phone.getByRole("status").filter({ hasText: "indiquez votre nom et votre numéro" })).toBeVisible();
  await phone.getByTestId("details-phone").fill("70 11 22 33");
  await phone.getByTestId("details-pickup").fill("12:30");
  await phone.getByTestId("send-order").click();
  await expect(phone.getByTestId("orders-sheet")).toBeVisible();
  const code = (await phone.getByTestId("my-order-code").first().textContent())!.trim();
  expect(code).toMatch(/^RD-\d{6}-001$/);

  // Front desk: the customer, a number to call, the pickup time, the full number with date and time.
  await page.goto("/app/service");
  const card = page.getByTestId("order-card").filter({ hasText: "Jus de bissap" });
  await expect(card).toContainText("Awa Ouédraogo");
  await expect(card.getByTestId("takeaway-contact")).toContainText("70 11 22 33");
  await expect(card.getByTestId("takeaway-contact").getByRole("link")).toHaveAttribute("href", "tel:70112233");
  await expect(card.getByTestId("takeaway-contact")).toContainText("Retrait à 12:30");
  await expect(card.getByTestId("order-code")).toHaveText(code);
  await expect(card.getByTestId("order-meta")).toContainText(/\d{2}\/\d{2} · \d{2}:\d{2}/);
  await expect(card.getByTestId("order-rank")).toHaveText("1er");

  // History: the full number finds it; so does the customer's phone.
  await page.goto(`/app/orders?q=${encodeURIComponent(code)}`);
  await expect(page.getByTestId("history-row")).toHaveCount(1);
  await expect(page.getByTestId("history-code")).toContainText(code);
  await page.goto(`/app/orders?q=${encodeURIComponent("70 11 22 33")}`);
  await expect(page.getByTestId("history-row")).toHaveCount(1);
  await ctx.close();
});

test("the front desk lists orders first received first, numbered 1er, 2e…", async ({ page, browser }) => {
  await resetDemoOrders();
  await patchDemoSettings({ orderValidation: "server_confirms", qrStrategy: "per_seat" });
  const { seatToken } = await import("./helpers");
  for (const [table, dish] of [["2", "Frites"], ["3", "Alloco"]] as const) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => sessionStorage.setItem("rc-welcome-restaurant-demo", "1"));
    const p = await ctx.newPage();
    await p.goto(`/r/restaurant-demo/t/${await seatToken(table)}`);
    await expect(p.getByTestId("seat-badge")).toContainText(`Table ${table}`, { timeout: 25_000 });
    await p.getByTestId("menu-item").filter({ hasText: dish }).first().getByRole("button", { name: /^Ajouter/ }).click();
    await p.getByTestId("cart-bar").click();
    await p.getByTestId("send-order").click();
    await expect(p.getByTestId("orders-sheet")).toBeVisible();
    await ctx.close();
  }
  await page.goto("/app/service");
  const col = page.getByTestId("col-new");
  await expect(col.getByTestId("order-card")).toHaveCount(2);
  await expect(col.getByTestId("order-card").nth(0)).toContainText("Frites");
  await expect(col.getByTestId("order-card").nth(0).getByTestId("order-rank")).toHaveText("1er");
  await expect(col.getByTestId("order-card").nth(1)).toContainText("Alloco");
  await expect(col.getByTestId("order-card").nth(1).getByTestId("order-rank")).toHaveText("2e");
  await expect(col).toContainText("Du plus ancien au plus récent");
});

test("takeaway straight from the cart (no place picker), a clear confirmation, dates, a ticket that fits the screen, finished orders removable", async ({ browser }) => {
  await resetDemoOrders();
  await patchDemoSettings({ orderValidation: "direct", qrStrategy: "generic", seatingModes: ["table", "room", "takeaway"] });
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  const phone = await ctx.newPage();
  await openMenu(phone);
  await phone.getByTestId("menu-search").fill("bissap");
  await phone.getByTestId("add-button").click();
  await phone.getByTestId("cart-bar").click();
  // « Sur place » or « À emporter », right in the cart.
  await expect(phone.getByTestId("order-mode")).toBeVisible();
  await phone.getByTestId("mode-takeaway").click();
  await expect(phone.getByTestId("seat-badge")).toContainText("À emporter");
  await phone.getByTestId("details-name").fill("Moussa");
  await phone.getByTestId("details-phone").fill("70 22 33 44");
  await phone.getByTestId("details-pickup").fill("13:15");
  await phone.getByTestId("send-order").click();
  const card = phone.getByTestId("my-order").first();
  // No need to show it to anyone: the business has it.
  await expect(card.getByTestId("takeaway-confirmation")).toContainText("reçue par l’établissement");
  await expect(card.getByTestId("takeaway-confirmation")).toContainText("Retrait à 13:15");
  await expect(card.getByTestId("my-order-date")).toContainText(/Envoyée le \d+/);
  // The ticket: everything visible without scrolling on a small phone.
  await card.getByTestId("show-server").click();
  const footer = phone.getByTestId("server-footer");
  await expect(footer).toBeInViewport({ ratio: 1 });
  await expect(phone.getByTestId("server-qr")).toBeInViewport({ ratio: 1 });
  await phone.getByRole("button", { name: "Fermer" }).click();

  // Served: the customer can remove it from their phone (the business keeps it).
  const [o] = await sql<{ id: string }>("select id from orders where customer_name = 'Moussa' order by sent_at desc limit 1");
  await sql("update orders set status = 'served', served_at = now() where id = $1", [o!.id]);
  await phone.reload();
  await phone.getByRole("button", { name: /Mes commandes/ }).click();
  const served = phone.getByTestId("my-order").filter({ hasText: "Moussa" }).or(phone.getByTestId("my-order").first());
  await expect(served.getByTestId("my-order-date")).toContainText("servie le");
  await served.getByTestId("hide-order").click();
  await expect(phone.getByTestId("my-order")).toHaveCount(0);
  expect((await sql("select 1 from orders where id = $1", [o!.id])).length).toBe(1);
  await ctx.close();
  await patchDemoSettings({ qrStrategy: "per_seat" });
});
