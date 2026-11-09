import { expect, test } from "@playwright/test";

test("privacy policy and terms are public, in French by default, with English versions and French aliases", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Politique de confidentialité" })).toBeVisible();
  await expect(page.getByText("Commission de l’Informatique et des Libertés").first()).toBeVisible();
  // Disclosures required for Google sign-in (OAuth consent screen review).
  await expect(page.getByRole("heading", { name: "5. Connexion avec Google" })).toBeVisible();
  await expect(page.getByRole("link", { name: "myaccount.google.com/permissions" })).toHaveAttribute("href", "https://myaccount.google.com/permissions");
  await page.getByRole("link", { name: "EN", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
  await expect(page.getByText(/including the Limited Use requirements/)).toBeVisible();
  await expect(page.getByText(/part of Tilogroup/)).toBeVisible();
  await expect(page.getByText("including the Limited Use requirements")).toBeVisible();
  await expect(page.getByText("part of Tilogroup")).toBeVisible();

  await page.goto("/conditions");
  await expect(page).toHaveURL(/\/terms\?lang=fr$/);
  await expect(page.getByRole("heading", { level: 1, name: "Conditions générales d’utilisation" })).toBeVisible();
  await expect(page.getByText("Vous pouvez vous connecter avec un compte Google")).toBeVisible();
  await expect(page.getByText(/régies par le droit de l’État de/)).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Confidentialité" })).toHaveAttribute("href", "/privacy");
  await expect(page.getByRole("link", { name: "Conditions d’utilisation" })).toHaveAttribute("href", "/terms");
});
