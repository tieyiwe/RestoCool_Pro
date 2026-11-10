import { expect, test } from "@playwright/test";
import { openMenu } from "./helpers";

test.describe.configure({ mode: "serial" });

test("the owner saves the business location from a Google Maps link", async ({ page }) => {
  await page.goto("/app/settings");
  const field = page.getByTestId("location-field");
  await field.getByTestId("location-link").fill("https://www.google.com/maps/place/Demo/@12.3,-1.5,17z/data=!3d12.371428!4d-1.519660");
  await field.getByTestId("location-link-save").click();
  await expect(field.getByTestId("location-msg")).toContainText("Emplacement enregistré");
  await expect(field.getByTestId("location-saved")).toContainText("12.37143, -1.51966");
});

test("« Je suis à mon établissement » warns first, then saves the phone's position", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 12.3655, longitude: -1.5332, accuracy: 15 });
  await page.goto("/app/settings");
  const field = page.getByTestId("location-field");
  await field.getByTestId("location-here").click();
  await expect(field.getByTestId("location-confirm")).toContainText("visible par vos clients");
  await field.getByTestId("location-confirm-yes").click();
  await expect(field.getByTestId("location-msg")).toContainText("Emplacement enregistré");
  await expect(field.getByTestId("location-saved")).toContainText("± 15 m");
  await expect(field.getByTestId("location-saved")).toContainText("12.36550, -1.53320");
});

test("customers get directions to the saved point", async ({ page }) => {
  await openMenu(page);
  const link = page.getByTestId("directions");
  await expect(link).toHaveAttribute("href", "https://www.google.com/maps/dir/?api=1&destination=12.3655,-1.5332");
});

test("the platform map lists located businesses (super admin, dev sign-in)", async ({ request }) => {
  const res = await request.get("/api/admin/locations");
  expect(res.status()).toBe(200);
  const geo = (await res.json()) as { type: string; features: { geometry: { coordinates: [number, number] }; properties: { slug: string; rc: string | null } }[] };
  expect(geo.type).toBe("FeatureCollection");
  const demo = geo.features.find((f) => f.properties.slug === "restaurant-demo");
  expect(demo?.geometry.coordinates).toEqual([-1.5332, 12.3655]);
  expect(demo?.properties.rc).toMatch(/^RC-/);
});
