import { expect, test } from "@playwright/test";
import { sql } from "./helpers";

const demoOwner = "clerk_user_id = 'dev-owner' and restaurant_id = (select id from restaurants where slug = 'restaurant-demo')";

test("a server only sees the sections they can open", async ({ page }) => {
  await sql(`update members set role = 'server' where ${demoOwner}`);
  try {
    await page.goto("/app");
    const nav = page.getByRole("navigation").first();
    await expect(nav.getByRole("link", { name: "Service" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Guide" })).toBeVisible();
    for (const hidden of ["Menu", "Tables et salles", "Personnel", "Paramètres"]) await expect(nav.getByRole("link", { name: hidden, exact: true })).toHaveCount(0);
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
