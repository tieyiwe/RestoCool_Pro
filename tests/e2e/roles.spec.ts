import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("the owner edits what a role opens, creates a role and assigns it", async ({ page }, info) => {
  const tag = info.project.name.replace(/\W/g, "");
  await page.goto("/app/staff");
  await page.getByTestId("roles-link").click();
  await expect(page.getByRole("heading", { name: "Rôles et accès" })).toBeVisible();

  // Ready-made roles, grouped by team.
  for (const name of ["Serveur·se", "Aide-cuisinier·ère", "Agent·e d'entretien", "Gérant·e adjoint·e"]) await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();

  // Tick « Plats épuisés » for the dishwasher role; it stays ticked.
  const dish = page.locator('[data-testid=role-card][data-role="dishwasher"]');
  await dish.getByTestId("access-soldOut").check();
  await dish.getByTestId("role-save").click();
  await expect(page.getByTestId("roles-ok")).toBeVisible();
  await expect(page.locator('[data-testid=role-card][data-role="dishwasher"]').getByTestId("access-soldOut")).toBeChecked();

  // A role the owner types in.
  const name = `Chef grillades ${tag}`;
  const form = page.getByTestId("create-role");
  await form.locator("input[name=name]").fill(name);
  await form.locator("select[name=group]").selectOption("kitchen");
  await form.getByText("Préparer (cuisine, bar)").click();
  await form.getByRole("button", { name: "Créer le rôle" }).click();
  await expect(page.getByTestId("roles-ok")).toContainText("Rôle créé");
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();

  // Add a person with that role, then change it.
  await page.goto("/app/staff");
  const add = page.getByTestId("add-person");
  await add.locator("input[name=name]").fill(`Moussa ${tag}`);
  await add.getByTestId("new-person-role").selectOption({ label: name });
  await add.locator("input[name=pin]").fill("2468");
  await add.getByRole("button").click();
  await expect(page.getByTestId("staff-ok")).toBeVisible();
  const row = page.getByTestId("personnel-row").filter({ hasText: `Moussa ${tag}` });
  await expect(row.getByTestId("person-role")).toHaveText(name);
  await row.getByTestId("role-select").selectOption({ label: "Plongeur·se" });
  await row.getByTestId("role-assign").click();
  await expect(page.getByTestId("staff-ok")).toContainText("Rôle mis à jour");
  await expect(page.getByTestId("personnel-row").filter({ hasText: `Moussa ${tag}` }).getByTestId("person-role")).toHaveText("Plongeur·se");
});
