import { expect, test } from "@playwright/test";
import { sql, freeDevOwnerSlots } from "./helpers";

test("a VIP bus company: create it, add a bus from rows and columns, an itinerary with its hostess, print the seat QR codes", async ({ page }, info) => {
  // Long path (creation, setup, buses, itineraries, print); the dev server compiles each page once.
  test.setTimeout(150_000);
  await freeDevOwnerSlots();
  const name = `Express Bus E2E ${info.project.name}`;
  try {
    await page.goto("/app/new");
    await page.getByTestId("kind-transport").click();
    await page.getByLabel("Nom de l'établissement").fill(name);
    await page.getByRole("button", { name: "Créer mon établissement" }).click();
    await expect(page).toHaveURL(/\/app\/onboarding\/1$/, { timeout: 30_000 }); // dev server compiles the setup on first use

    // The « service » step asks for the first bus: the seat map draws itself from the numbers.
    await page.goto("/app/onboarding/4");
    const form = page.getByTestId("bus-form");
    await form.locator("input[name=name]").fill("Bus 12");
    await form.locator("input[name=rows]").fill("12");
    await expect(page.getByTestId("bus-total")).toHaveText("52 sièges au total");
    await form.getByText("Porte au milieu").click();
    await form.locator("input[name=doorRow]").fill("7");
    await expect(page.getByTestId("bus-total")).toHaveText("50 sièges au total");
    await expect(page.getByTestId("bus-preview").getByTestId("map-seat")).toHaveCount(50);
    await page.getByTestId("bus-submit").click();
    await expect(page).toHaveURL(/\/app\/onboarding\/4\?ok=busCreated/);
    await expect(page.getByTestId("setup-bus-count")).toContainText("1 bus ajouté");
    await page.getByTestId("setup-buses-next").click();
    await expect(page).toHaveURL(/\/onboarding\/5$/);
    await page.getByRole("button", { name: "Terminer la configuration" }).click();
    await expect(page.getByTestId("setup-done")).toBeVisible();

    // Buses & itineraries replace tables for a bus company.
    await page.goto("/app/seating");
    await expect(page).toHaveURL(/\/app\/buses$/);
    const bus = page.getByTestId("bus-card").filter({ hasText: "Bus 12" });
    await expect(bus).toContainText("50 sièges");
    await expect(bus.getByTestId("bus-map").getByTestId("map-seat")).toHaveCount(50);

    // An itinerary.
    const route = page.getByTestId("route-form");
    await route.getByTestId("route-destination").selectOption("Koudougou");
    await route.getByRole("button", { name: "Ajouter" }).click();
    await expect(page.getByTestId("buses-ok")).toContainText("Itinéraire ajouté", { timeout: 60_000 });
    await expect(page.getByTestId("route-card").filter({ hasText: "Ouagadougou → Koudougou" })).toBeVisible();

    // Seat-back cards: one per seat, plus the bus's own QR.
    await page.goto("/app/buses");
    await page.getByTestId("bus-card").filter({ hasText: "Bus 12" }).getByTestId("bus-print").click();
    await expect(page.getByTestId("seat-card")).toHaveCount(50, { timeout: 60_000 });
    await expect(page.getByTestId("seat-card").first()).toContainText("Siège 1");
    await expect(page.getByTestId("seat-card").first()).toContainText(/RC-[A-Z2-9]{5}/);
    await expect(page.getByTestId("bus-qr-card")).toContainText("Bus 12");
  } finally {
    await sql("delete from restaurants where name = $1", [name]);
  }
  // Back to the demo for the other tests.
  await page.goto("/app");
  const switcher = page.getByLabel("Changer d'établissement");
  if (await switcher.count()) {
    await switcher.selectOption({ label: "Restaurant Démo" });
    await page.getByRole("button", { name: "Valider" }).click();
  }
  await expect(page.getByTestId("restaurant-name")).toHaveText("Restaurant Démo");
});
