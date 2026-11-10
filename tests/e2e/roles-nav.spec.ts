import { expect, test } from "@playwright/test";
import { sql } from "./helpers";

const demoOwner = "clerk_user_id = 'dev-owner' and restaurant_id = (select id from restaurants where slug = 'restaurant-demo')";

test("a server only sees the sections they can open", async ({ page }) => {
  await sql(`update members set role = 'server' where ${demoOwner}`);
  try {
    await page.goto("/app");
    // Phones: bottom tabs + « Plus »; tablets and up: the side menu.
    const phone = await page.getByTestId("bottom-tabs").isVisible();
    if (phone) await page.getByTestId("more-tab").click();
    await expect(page.locator('a[href="/app/service"]:visible').first()).toBeVisible();
    await expect(page.locator('a[href="/app/guide"]:visible').first()).toBeVisible();
    for (const hidden of ["/app/menu", "/app/seating", "/app/staff", "/app/settings", "/app/orders"]) await expect(page.locator(`a[href="${hidden}"]`)).toHaveCount(0);
  } finally {
    await sql(`update members set role = 'owner' where ${demoOwner}`);
  }
});

test("the QR print page never scrolls sideways on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/app/seating/print?layout=grid");
  await expect(page.getByTestId("print-card").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
