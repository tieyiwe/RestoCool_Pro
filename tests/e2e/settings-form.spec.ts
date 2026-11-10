import { expect, test } from "@playwright/test";

test("a refused settings save keeps what the owner typed", async ({ page }) => {
  await page.goto("/app/settings");
  const form = page.getByTestId("contacts-form");
  await form.locator("input[name=phone1]").fill("70 11 22 33");
  await form.locator("input[name=whatsapp]").fill("123");
  await form.getByRole("button").click();
  await expect(form.getByRole("alert")).toContainText("Numéro invalide");
  // React resets <form action> after each submission; the values must survive the error.
  await expect(form.locator("input[name=phone1]")).toHaveValue("70 11 22 33");
  await expect(form.locator("input[name=whatsapp]")).toHaveValue("123");
});
