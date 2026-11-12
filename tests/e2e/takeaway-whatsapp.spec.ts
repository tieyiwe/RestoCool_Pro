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
    expect(decodeURIComponent((await popup).url())).toContain("wa.me/22670112233");

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
