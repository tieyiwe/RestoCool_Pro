import { expect, test } from "@playwright/test";
import { openMenu, sql } from "./helpers";

test("the owner chooses which WhatsApp receives takeaway orders; « À emporter » opens that one", async ({ page, context }) => {
  const [before] = await sql<{ settings: Record<string, unknown> }>("select settings from restaurants where slug = 'restaurant-demo'");
  await context.route("https://wa.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "ok" }));
  try {
    await page.goto("/app/settings#contacts");
    const form = page.getByTestId("contacts-form");
    await expect(form.getByText("Est-ce ce WhatsApp qui reçoit vos commandes à emporter ?")).toBeVisible();
    await expect(form.getByTestId("takeaway-same")).toBeChecked(); // yes by default
    await expect(form.getByTestId("takeaway-whatsapp")).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    await form.getByTestId("takeaway-same").uncheck();
    // « Non »: another number is required.
    await form.getByRole("button", { name: "Enregistrer" }).click();
    await expect(form.getByTestId("takeaway-whatsapp")).toBeVisible();
    await form.getByTestId("takeaway-whatsapp").fill("70 11 22 33");
    await form.getByRole("button", { name: "Enregistrer" }).click();
    await expect(form.getByRole("status").filter({ hasText: "Enregistré" })).toBeVisible();
    const [after] = await sql<{ settings: { takeawayWhatsapp?: string } }>("select settings from restaurants where slug = 'restaurant-demo'");
    expect(after!.settings.takeawayWhatsapp).toBe("22670112233");

    await openMenu(page);
    await page.getByTestId("menu-search").fill("bissap");
    await page.getByTestId("add-button").click();
    await page.getByTestId("cart-bar").click();
    await page.getByRole("button", { name: /ommander à emporter/ }).click();
    await page.getByLabel("Votre nom").fill("Awa");
    await page.getByLabel("Heure de retrait").fill("12:30");
    const popup = context.waitForEvent("page");
    await page.getByRole("button", { name: "Envoyer sur WhatsApp" }).click();
    const wa = await popup;
    await wa.waitForURL(/wa\.me/);
    const waUrl = decodeURIComponent(wa.url());
    expect(waUrl).toContain("wa.me/22670112233");
    // The message carries the order number recorded on RestoCool.
    expect(waUrl).toMatch(/Commande n° \d+/);
    await wa.close();

    // The dashboard got it too: « Remise au client » marks it as done.
    await page.goto("/app");
    const card = page.getByTestId("whatsapp-orders");
    const order = card.getByTestId("wa-order").filter({ hasText: "Awa" }).first();
    await expect(order).toBeVisible();
    await expect(order).toContainText("Retrait à 12:30");
    await expect(order).toContainText("bissap");
    await order.getByTestId("wa-done").click();
    await expect(card.getByTestId("wa-order").filter({ hasText: "Awa" })).toHaveCount(0);
    const [done] = await sql<{ status: string; channel: string }>("select status, channel from orders where customer_name = 'Awa' and channel = 'whatsapp' order by created_at desc limit 1");
    expect(done).toMatchObject({ status: "served", channel: "whatsapp" });

    // Back to « Oui »: the main WhatsApp again.
    await page.goto("/app/settings#contacts");
    await page.waitForLoadState("networkidle");
    await page.getByTestId("contacts-form").getByTestId("takeaway-same").check();
    await page.getByTestId("contacts-form").getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByTestId("contacts-form").getByRole("status").filter({ hasText: "Enregistré" })).toBeVisible();
    const [back] = await sql<{ settings: { takeawayWhatsapp?: string } }>("select settings from restaurants where slug = 'restaurant-demo'");
    expect(back!.settings.takeawayWhatsapp).toBeUndefined();
  } finally {
    await sql("update restaurants set settings = $1::jsonb where slug = 'restaurant-demo'", [JSON.stringify(before!.settings)]);
  }
});

test("takeaway and delivery only: no dine-in choice for customers, no tables screens; back to dine-in in Settings", async ({ page }) => {
  const [before] = await sql<{ settings: Record<string, unknown> }>("select settings from restaurants where slug = 'restaurant-demo'");
  try {
    await page.goto("/app/settings#service");
    const form = page.getByTestId("service-form");
    await page.waitForLoadState("networkidle");
    await expect(form.getByTestId("service-types")).toBeVisible();
    await form.getByTestId("type-dine_in").uncheck();
    await form.getByTestId("type-takeaway").check();
    await form.getByTestId("type-delivery").check();
    // The dine-in details disappear when « Sur place » is unticked.
    await expect(form.getByTestId("dine-in-details")).toBeHidden();
    await form.getByRole("button", { name: "Enregistrer" }).click();
    await expect(form.getByRole("status").filter({ hasText: "Enregistré" })).toBeVisible();
    const [after] = await sql<{ settings: { seatingModes?: string[] } }>("select settings from restaurants where slug = 'restaurant-demo'");
    expect(after!.settings.seatingModes).toEqual(["takeaway", "delivery"]);
    // No tables screens in the app.
    await page.goto("/app/guide");
    await expect(page.locator('a[href="/app/tables"]')).toHaveCount(0);
    await expect(page.locator('a[href="/app/reservations"]')).toHaveCount(0);
    // Nothing ticked: refused with a clear message.
    await page.goto("/app/settings#service");
    await page.waitForLoadState("networkidle");
    for (const k of ["takeaway", "delivery"]) await page.getByTestId("service-form").getByTestId(`type-${k}`).uncheck();
    await page.getByTestId("service-form").getByRole("button", { name: "Enregistrer" }).click();
    await expect(page.getByTestId("service-form")).toContainText("au moins une façon");
  } finally {
    await sql("update restaurants set settings = $1::jsonb where slug = 'restaurant-demo'", [JSON.stringify(before!.settings)]);
  }
});
