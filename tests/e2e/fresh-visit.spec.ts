import { expect, test } from "@playwright/test";
import { openMenu } from "./helpers";

test("coming back after a while starts fresh: empty cart, place to choose again, last selection kept in « Sélections précédentes »", async ({ page }) => {
  await openMenu(page, "shangri-la");
  await page.getByTestId("add-button").first().click();
  await page.getByTestId("add-button").nth(1).click();
  await expect(page.getByTestId("cart-total")).toBeVisible();
  // Same visit (a reload a minute later): the cart is still there.
  await page.reload();
  await expect(page.getByTestId("cart-total")).toBeVisible();
  // Leaves (another page in the same tab), comes back 3 hours later.
  await page.goto("/restaurants");
  await page.evaluate(() => localStorage.setItem("rc-lastseen-shangri-la", String(Date.now() - 3 * 60 * 60 * 1000)));
  await page.goto("/r/shangri-la");
  await expect(page.getByTestId("cart-bar")).toHaveCount(0);
  await expect(page.getByTestId("choose-seat")).toBeVisible();
  // Nothing lost: the previous selection can be reused.
  await page.getByTestId("add-button").first().click();
  await page.getByTestId("cart-bar").click();
  await page.getByTestId("history-link").click();
  await expect(page.getByTestId("history-entry").first()).toBeVisible();
});
