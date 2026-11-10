import { expect, test } from "@playwright/test";

test("the owner's back office: live figures, alerts, every section, personnel ranking", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByTestId("live-strip")).toBeVisible();
  await expect(page.getByTestId("live-revenue")).toContainText("F");
  await expect(page.getByTestId("alerts")).toBeVisible();
  const shortcuts = page.getByTestId("shortcuts");
  for (const name of ["Accueil commandes", "Cuisine", "Historique", "Menu", "Personnel", "Rôles et accès", "Paramètres"]) await expect(shortcuts.getByRole("link", { name, exact: true })).toBeVisible();
  // Demo personnel are ranked (the owner is not).
  const ranking = page.getByTestId("ranking");
  await expect(ranking.getByTestId("ranking-row").filter({ hasText: "Awa" })).toBeVisible();
  await expect(ranking.getByTestId("ranking-row").filter({ hasText: "Propriétaire Démo" })).toHaveCount(0);
  await expect(ranking).toContainText("Calcul");
  // No horizontal scroll on phones.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("order history filters and exports a CSV that Excel reads", async ({ page, request }) => {
  await page.goto("/app");
  await page.getByTestId("shortcuts").getByRole("link", { name: "Historique" }).click();
  await expect(page.getByRole("heading", { name: "Historique des commandes" })).toBeVisible();
  const filters = page.getByTestId("history-filters");
  await filters.locator("select[name=range]").selectOption("30d");
  await filters.locator("select[name=status]").selectOption("cancelled");
  await filters.getByRole("button", { name: "Filtrer" }).click();
  await expect(page).toHaveURL(/range=30d/);
  await expect(page).toHaveURL(/status=cancelled/);
  await expect(page.getByTestId("history-list").or(page.getByTestId("history-empty"))).toBeVisible();

  const res = await request.get("/api/app/orders/export?range=30d");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
  const body = await res.text();
  expect(body.charCodeAt(0)).toBe(0xfeff);
  expect(body).toContain("Numéro,Statut");
});
