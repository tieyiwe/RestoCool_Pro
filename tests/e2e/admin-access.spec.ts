import { expect, test } from "@playwright/test";
import { sql } from "./helpers";

test("someone signed in who is not super admin: the whole console is « not found », the app shows no link to it", async ({ page, context, request }) => {
  await context.addCookies([{ name: "rc_dev_not_superadmin", value: "1", domain: "localhost", path: "/" }]);
  const [r] = await sql<{ id: string }>("select id from restaurants where slug = 'restaurant-demo'");
  for (const path of ["/admin_pro", "/admin_pro/businesses", `/admin_pro/businesses/${r!.id}`, "/admin_pro/billing", "/admin_pro/map", "/admin_pro/activity", "/admin_pro/settings"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
    await expect(page.getByTestId("admin-overview")).toHaveCount(0);
    await expect(page.getByTestId("admin-nav")).toHaveCount(0);
    await expect(page.getByTestId("admin-tabs")).toHaveCount(0);
  }
  // The data downloads too (CSV of businesses, map positions).
  for (const path of ["/api/admin/businesses", "/api/admin/locations"]) {
    const res = await page.request.get(path);
    expect(res.status(), path).toBe(404);
    expect(await res.text()).not.toContain("Restaurant Démo");
  }
  // The business app (they are a member of the demo) has no « Super admin » link.
  await page.goto("/app");
  await expect(page.getByTestId("app-shell").or(page.locator("main")).first()).toBeVisible();
  await expect(page.locator('a[href^="/admin_pro"]')).toHaveCount(0);
  void request;
});

test("the super admin sees the console and the link in the app", async ({ page }) => {
  await page.goto("/app");
  // On phones the link sits in the « Plus » sheet: it must be in the page, visible or not.
  await expect(page.locator('a[href="/admin_pro"]').first()).toBeAttached();
  const res = await page.goto("/admin_pro");
  expect(res?.status()).toBe(200);
  await expect(page.getByTestId("admin-overview")).toBeVisible();
});
