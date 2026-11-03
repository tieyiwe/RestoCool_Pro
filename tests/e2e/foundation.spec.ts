import { expect, test } from "@playwright/test";
import { testTenantItemId } from "./helpers";

const N = " ";

test("health endpoint reports the database is up", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect(await res.json()).toMatchObject({ status: "ok", db: "ok" });
});

test("holding page shows the brand and links to the demo menu", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("img", { name: "RestoCool" })).toBeVisible();
  await expect(page.getByText("RestoCool : votre menu, vos commandes, vos tables. Simple.")).toBeVisible();
  await page.getByRole("link", { name: "Voir le menu de démonstration" }).click();
  await expect(page).toHaveURL(/\/r\/restaurant-demo$/);
});

test.describe("public menu", () => {
  test("renders the demo restaurant in French with FCFA prices", async ({ page }) => {
    await page.goto("/r/restaurant-demo");
    await expect(page.getByRole("heading", { level: 1, name: "Restaurant Démo" })).toBeVisible();
    await expect(page.getByTestId("menu-item")).toHaveCount(40);
    await expect(page.getByText(`48${N}000${N}F / 78${N}000${N}F`)).toBeVisible();
    // A dish with no price shows « Sur demande », never 0 F.
    const fish = page.getByTestId("menu-item").filter({ hasText: "Poisson braisé" });
    await expect(fish).toContainText("Sur demande");
    await expect(page.getByText(`0${N}F`, { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "RestoCool" })).toHaveAttribute("href", "https://restocool.com");
  });

  test("has no horizontal scroll", async ({ page }) => {
    await page.goto("/r/restaurant-demo");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("an unpublished menu of another restaurant is not found", async ({ page }) => {
    const res = await page.goto("/r/maquis-temoin");
    expect(res?.status()).toBe(404);
    await expect(page.getByText("Plat secret du témoin")).toHaveCount(0);
  });
});

test.describe("owner app (dev sign-in bypass)", () => {
  test("dashboard shows the restaurant, plan and counts", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByTestId("restaurant-name")).toHaveText("Restaurant Démo");
    await expect(page.getByText("Essai", { exact: true })).toBeVisible();
    await expect(page.getByText("Propriétaire", { exact: true })).toBeVisible();
  });

  test("language switch is remembered for the staff app", async ({ page }) => {
    await page.goto("/app");
    await page.getByRole("button", { name: "en", exact: true }).click();
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await page.getByRole("button", { name: "zh", exact: true }).click();
    await expect(page.getByRole("link", { name: "概览" })).toBeVisible();
    await page.getByRole("button", { name: "fr", exact: true }).click();
    await expect(page.getByRole("link", { name: "Tableau de bord" })).toBeVisible();
  });
});

test.describe("tenant isolation", () => {
  test("menu API only returns the caller's restaurant, whatever the query says", async ({ request }) => {
    const res = await request.get("/api/app/menu/items?restaurantId=00000000-0000-0000-0000-000000000000");
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as { items: Array<{ restaurantId: string }>; restaurantId: string };
    expect(body.items).toHaveLength(40);
    expect(body.items.every((i) => i.restaurantId === body.restaurantId)).toBe(true);
  });

  test("reading another restaurant's item by id is a 404", async ({ request }) => {
    const otherId = await testTenantItemId();
    const res = await request.get(`/api/app/menu/items/${otherId}`);
    expect(res.status()).toBe(404);
  });
});

test("admin lists restaurants", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Restaurants" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Restaurant Démo" })).toBeVisible();
});
