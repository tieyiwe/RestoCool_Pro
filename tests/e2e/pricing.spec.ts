import { expect, test } from "@playwright/test";

test("/tarifs: plan cards, the full comparison from the plan config, how to pay, questions; the home links to it", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("pricing-details").click();
  await expect(page).toHaveURL(/\/tarifs$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tarifs");
  await expect(page).toHaveTitle(/Tarifs RestoCool/);
  for (const p of ["gratuit", "pro", "business"]) await expect(page.getByTestId(`plan-${p}`)).toBeVisible();
  await expect(page.getByTestId("plan-pro")).toContainText(/10\s000/);

  // Comparison follows src/config/plans.ts.
  const items = page.getByTestId("compare-items");
  await expect(items.locator('[data-plan="gratuit"]')).toHaveText("40");
  await expect(items.locator('[data-plan="pro"]')).toHaveText("Illimité");
  await expect(page.getByTestId("compare-ordering").locator('[data-plan="gratuit"]')).toContainText("Non inclus");
  await expect(page.getByTestId("compare-ordering").locator('[data-plan="pro"]')).toContainText("Inclus");
  await expect(page.getByTestId("compare-staff").locator('[data-plan="pro"]')).toHaveText("10");
  await expect(page.getByTestId("compare-promotions").locator('[data-plan="pro"]')).toContainText("Non inclus");
  await expect(page.getByTestId("compare-promotions").locator('[data-plan="business"]')).toContainText("Inclus");
  // Reservations: Pro and Business; not built yet (combined multi-branch reports): « Bientôt », never a tick.
  await expect(page.getByTestId("compare-reservations").locator('[data-plan="pro"]')).toContainText("Inclus");
  await expect(page.getByTestId("compare-reservations").locator('[data-plan="gratuit"]')).toContainText("Non inclus");
  await expect(page.getByTestId("compare-multiBranch").locator('[data-plan="business"]')).toHaveText("Bientôt");
  await expect(page.getByText("Orange Money").first()).toBeVisible();

  // The page never scrolls sideways (the table scrolls in its own box on phones).
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  // Old English address goes to the same page; it is in the sitemap.
  await page.goto("/pricing");
  await expect(page).toHaveURL(/\/tarifs$/);
  const sitemap = await (await page.request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/tarifs");
});
