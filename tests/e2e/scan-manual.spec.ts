import { expect, test } from "@playwright/test";

// No camera here: the typed fallback must work on its own.
test("a typed numéro RC opens the restaurant; foreign links are refused", async ({ page }) => {
  await page.goto("/app/scan");
  await page.getByTestId("scan-manual").fill("https://evil.example/login");
  await page.getByTestId("scan-manual-go").click();
  await expect(page.getByTestId("scan-unknown")).toBeVisible();
  await page.getByTestId("scan-manual").fill("RC-ZZZZZ");
  await page.getByTestId("scan-manual-go").click();
  await expect(page).toHaveURL(/\/c\/ZZZZZ/);
});
