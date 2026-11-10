import { expect, test } from "@playwright/test";

test("managers learn with animated tutorials; finishing one marks it watched on the dashboard", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByTestId("learn-card")).toContainText("0 tutoriel(s) vu(s) sur 7");
  await page.getByTestId("learn-card").getByRole("link", { name: "Voir tous les tutoriels" }).click();
  await expect(page).toHaveURL(/\/app\/guide\?for=manager$/);
  await expect(page.getByTestId("guide-player")).toHaveAttribute("data-guide", "menu");

  // Step through « Ajouter vos plats » by hand (pauses autoplay) until the last step.
  for (let i = 0; i < 3; i++) await page.getByTestId("guide-next").click();
  await expect(page.getByTestId("guide-step").nth(3)).toHaveAttribute("aria-current", "step");
  await expect(page.getByTestId("guide-progress")).toHaveText("1 tutoriel(s) vu(s) sur 7");
  await expect(page.getByTestId("guide-card").first()).toContainText("Vu");

  // « Essayer maintenant » opens the real feature.
  await page.getByTestId("guide-try").click();
  await expect(page).toHaveURL(/\/app\/menu$/, { timeout: 30_000 });
  await page.goto("/app");
  await expect(page.getByTestId("learn-card")).toContainText("1 tutoriel(s) vu(s) sur 7");
});

test("personnel tutorials are public (no account) and linked from the check-in page", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/pointage");
  await page.getByTestId("kiosk-guide").click();
  await expect(page).toHaveURL(/\/guide\?for=staff$/);
  await expect(page.getByTestId("guide-player")).toHaveAttribute("data-guide", "checkin");
  // The first click can land before the page is interactive on a cold dev server: retry.
  await expect(async () => {
    await page.getByTestId("guide-card").filter({ hasText: "écran cuisine" }).click();
    await expect(page.getByTestId("guide-player")).toHaveAttribute("data-guide", "kitchen", { timeout: 1500 });
  }).toPass({ timeout: 20_000 });
  // Staff-app links are hidden on the public page (they need a sign-in).
  await expect(page.getByTestId("guide-try")).toHaveCount(0);
  await page.getByTestId("guide-tab-manager").click();
  await expect(page.getByTestId("guide-card")).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  await ctx.close();
});
