import { expect, test } from "@playwright/test";
import { sql } from "./helpers";

test("the directory narrows results as you type, by name or by numéro RC; unpublished restaurants never show", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("home-directory-link").click();
  await expect(page).toHaveURL(/\/restaurants$/);
  await expect(page.getByTestId("directory-featured")).toContainText("Restaurant Démo");

  const input = page.getByTestId("directory-input");
  await input.fill("dém");
  await expect(page.getByTestId("directory-count")).toHaveText("1 restaurant(s)");
  await input.fill("zzzz");
  await expect(page.getByText("Aucun restaurant ne correspond")).toBeVisible();

  const [row] = await sql<{ code: string }>(
    "select a.code from access_codes a join restaurants r on r.id = a.restaurant_id where r.slug = 'restaurant-demo' and a.seat_id is null",
  );
  await input.fill(`rc-${row!.code.toLowerCase()}`);
  await expect(page.getByTestId("directory-card")).toHaveCount(1);
  await expect(page.getByTestId("directory-card")).toContainText(`RC-${row!.code}`);

  // The test tenant is unpublished: not found by name.
  await input.fill("Témoin");
  await expect(page.getByTestId("directory-count")).toHaveText("0 restaurant(s)");
  // Works without JavaScript too (server-rendered ?q=).
  await page.goto("/restaurants?q=demo");
  await expect(page.getByTestId("directory-card")).toContainText("Restaurant Démo");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
