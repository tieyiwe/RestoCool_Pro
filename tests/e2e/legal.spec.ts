import { expect, test } from "@playwright/test";

test("privacy policy and terms are public, in French by default, with English versions and French aliases", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Politique de confidentialité" })).toBeVisible();
  await expect(page.getByText("Commission de l’Informatique et des Libertés")).toBeVisible();
  await page.getByRole("link", { name: "EN", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();

  await page.goto("/conditions");
  await expect(page).toHaveURL(/\/terms\?lang=fr$/);
  await expect(page.getByRole("heading", { level: 1, name: "Conditions générales d’utilisation" })).toBeVisible();
  await expect(page.getByText("juridictions de Ouagadougou")).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Confidentialité" })).toHaveAttribute("href", "/privacy");
  await expect(page.getByRole("link", { name: "Conditions d’utilisation" })).toHaveAttribute("href", "/terms");
});
