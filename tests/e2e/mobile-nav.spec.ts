import { expect, test } from "@playwright/test";

test.describe("phones: home menu and console navigation", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1024) >= 768, "phone layout only");

  test("home: the « Menu » button opens every link; the back button closes it; nothing is wider than the screen", async ({ page }) => {
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // The hero text and buttons fit (nothing cut on the right).
    const cta = page.getByRole("link", { name: /Créer mon établissement gratuitement/ }).first();
    const box = await cta.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);

    await page.getByTestId("mobile-menu-button").click();
    const menu = page.getByTestId("mobile-menu");
    await expect(menu).toBeVisible();
    for (const name of ["Fonctionnalités", "Comment ça marche", "Explorer", "Tarifs", "Questions", "Entrer un numéro RC", "Se connecter", "Essayer gratuitement"]) {
      await expect(menu.getByRole("link", { name })).toBeVisible();
    }
    await expect(menu.getByRole("button", { name: "en", exact: true })).toBeVisible(); // language switch
    // The phone's back button closes the panel and stays on the page.
    await page.goBack();
    await expect(menu).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);
    // A link goes where it says.
    await page.getByTestId("mobile-menu-button").click();
    await page.getByTestId("mobile-menu").getByRole("link", { name: "Explorer" }).click();
    await expect(page).toHaveURL(/\/restaurants/);
  });

  test("console: bottom tabs, « Menu » with every page and the business search", async ({ page }) => {
    await page.goto("/admin_pro");
    const tabs = page.getByTestId("admin-tabs");
    await expect(tabs).toBeVisible();
    await expect(page.getByTestId("admin-nav")).toBeHidden();
    await tabs.getByRole("link", { name: /Businesses/ }).click();
    await expect(page).toHaveURL(/\/admin_pro\/businesses/);
    await expect(tabs.getByRole("link", { name: /Businesses/ })).toHaveAttribute("aria-current", "page");
    // Filters fold away on a phone; the list shows as cards.
    await expect(page.getByTestId("admin-business-card").first()).toBeVisible();

    await page.getByTestId("admin-menu-button").click();
    const menu = page.getByTestId("admin-menu");
    for (const name of [/Subscriptions/, /Map/, /Messages/, /Team/, /Settings/]) await expect(menu.getByRole("link", { name })).toBeVisible();
    await menu.getByRole("searchbox").fill("Démo");
    await menu.getByRole("searchbox").press("Enter");
    await expect(page).toHaveURL(/businesses\?q=D/);
    await expect(page.getByTestId("admin-business-card").filter({ hasText: "Restaurant Démo" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
