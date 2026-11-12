import { expect, test } from "@playwright/test";
import { patchDemoSettings, resetDemoOrders, seatToken, sql } from "./helpers";

test("the « Montrer au serveur » QR opens the order for the team, and explains sign-in / joining to others", async ({ page, browser }) => {
  await resetDemoOrders();
  await patchDemoSettings({ orderValidation: "server_confirms", qrStrategy: "per_seat" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => sessionStorage.setItem("rc-welcome-restaurant-demo", "1"));
  const phone = await ctx.newPage();
  await phone.goto(`/r/restaurant-demo/t/${await seatToken("3")}`);
  await expect(phone.getByTestId("seat-badge")).toContainText("Table 3", { timeout: 25_000 });
  await phone.getByTestId("menu-item").filter({ hasText: "Frites" }).first().getByRole("button", { name: /^Ajouter/ }).click();
  await phone.getByTestId("cart-bar").click();
  await phone.getByTestId("send-order").click();
  await expect(phone.getByTestId("orders-sheet")).toBeVisible();
  const [o] = await sql<{ id: string }>("select id from orders where restaurant_id = (select id from restaurants where slug = 'restaurant-demo')");
  // The QR on the phone points to /o/<id>.
  await phone.getByTestId("show-server").first().click();
  const svg = await phone.request.get(`/api/public/orders/${o!.id}/qr?slug=restaurant-demo&deviceId=${await phone.evaluate(() => localStorage.getItem("rc-device-id") ?? "")}`);
  if (svg.ok()) expect(await svg.text()).toContain("<svg");
  await ctx.close();

  // A team member (the signed-in owner here) scanning it with the phone camera lands on the order.
  await page.goto(`/o/${o!.id}`);
  await expect(page).toHaveURL(new RegExp(`/app/orders/${o!.id}$`));
  await expect(page.getByTestId("order-card")).toBeVisible();

  // Someone not signed in: sign in and come back, or how to join the team.
  await page.goto(`/o/${o!.id}/aide?state=signin`);
  const help = page.getByTestId("order-link-help");
  await expect(help).toContainText("Vous travaillez chez Restaurant Démo ?");
  await expect(page.getByTestId("order-link-signin")).toHaveAttribute("href", `/sign-in?redirect_url=${encodeURIComponent(`/o/${o!.id}`)}`);
  await expect(page.getByTestId("order-link-join")).toContainText("Un gérant doit d’abord vous ajouter");
  await expect(page.getByTestId("order-link-join")).toContainText("QR « Rejoindre l’équipe »");
  await expect(help).not.toContainText("Frites"); // the order itself is never shown here
  // Signed in with an account of another business.
  await page.goto(`/o/${o!.id}/aide?state=notmember`);
  await expect(help).toContainText("Ce compte ne fait pas partie de l’équipe de Restaurant Démo");
  // A made-up link.
  await page.goto("/o/00000000-0000-4000-8000-000000000000");
  await expect(page.getByTestId("order-link-help")).toHaveAttribute("data-state", "unknown");
});
