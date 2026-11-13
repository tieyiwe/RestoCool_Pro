import { expect, test } from "@playwright/test";

test("every business page has a small RestoCool button that goes back to the platform home", async ({ page }) => {
  await page.addInitScript("sessionStorage.setItem('rc-welcome-shangri-la', '1'); sessionStorage.setItem('rc-welcome-restaurant-demo', '1')");
  for (const slug of ["shangri-la", "restaurant-demo"]) {
    await page.goto(`/r/${slug}`);
    const back = page.getByTestId("back-to-platform");
    await expect(back).toBeVisible();
    await expect(back).toHaveAccessibleName(/Retour à RestoCool/);
    const box = await back.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    // Nothing overflows the bar at phone width.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.getByTestId("back-to-platform").click();
  await expect(page).toHaveURL(/\/$/);
});
