import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("an owner creates a second restaurant, lands on it, and can switch back", async ({ page }, info) => {
  const name = `Maquis E2E ${info.project.name}`;
  await page.goto("/app/new");
  await expect(page.getByRole("heading", { name: "Créer votre restaurant" })).toBeVisible();

  // Validation error is shown in French.
  await page.getByLabel("Nom du restaurant").fill("x");
  await page.getByRole("button", { name: "Créer mon restaurant" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "au moins 2 caractères" })).toBeVisible();

  await page.getByLabel("Nom du restaurant").fill(name);
  await page.getByLabel("Ville").fill("Koudougou");
  await page.getByRole("button", { name: "Créer mon restaurant" }).click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByTestId("restaurant-name")).toHaveText(name);
  await expect(page.getByText("Propriétaire", { exact: true })).toBeVisible();

  // The new restaurant is empty and isolated: its menu API returns no items.
  const res = await page.request.get("/api/app/menu/items");
  expect((await res.json()).items).toHaveLength(0);

  // Switch back to the demo restaurant.
  await page.getByLabel("Changer de restaurant").selectOption({ label: "Restaurant Démo" });
  await page.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByTestId("restaurant-name")).toHaveText("Restaurant Démo");
});
