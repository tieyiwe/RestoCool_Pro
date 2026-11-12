import { expect, test } from "@playwright/test";
test("the console lives at /admin_pro; /admin is not found; robots.txt does not reveal it", async ({ page, request }) => {
  const old = await request.get("/admin");
  expect(old.status()).toBe(404);
  await page.goto("/admin_pro");
  await expect(page.getByTestId("admin-overview")).toBeVisible();
  expect(await (await request.get("/robots.txt")).text()).not.toContain("admin_pro");
  const res = await request.get("/admin_pro");
  expect(res.headers()["x-robots-tag"]).toContain("noindex");
});
