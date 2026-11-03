import { expect, test } from "@playwright/test";

test("the demo animation walks through scan → selection → server scan → served", async ({ page }) => {
  await page.goto("/demo");
  const demo = page.getByTestId("demo-animation");
  await expect(demo).toBeVisible();
  await page.getByRole("button", { name: "Pause" }).click();

  await page.getByRole("button", { name: "Étape suivante" }).click();
  await expect(page.getByTestId("demo-caption")).toContainText("Il compose sa sélection");

  await page.getByRole("button", { name: "Étape suivante" }).click();
  await page.getByRole("button", { name: "Étape suivante" }).click();
  await expect(page.getByTestId("demo-caption")).toContainText("Le serveur scanne la commande");
  // A real QR code is rendered (server-side SVG).
  await expect(demo.locator("svg path").first()).toBeAttached();

  await page.getByRole("button", { name: "Étape suivante" }).click();
  await expect(page.getByTestId("demo-caption")).toContainText("Servi, bon appétit !");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("home page shows the brand icon and the demo", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Comment ça marche" })).toBeVisible();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  const icon = await page.request.get("/brand/png/app-icon-192.png");
  expect(icon.ok()).toBe(true);
});
