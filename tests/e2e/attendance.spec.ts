import { expect, test, type Browser } from "@playwright/test";
import { patchDemoSettings, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

const demo = "(select id from restaurants where slug = 'restaurant-demo')";

test.beforeEach(async () => {
  await sql(`delete from attendance where restaurant_id = ${demo}`);
  await sql(`update members set pin_failures = 0, locked_until = null where restaurant_id = ${demo}`);
  await sql(`delete from members where restaurant_id = ${demo} and staff_no > 3`);
  await sql(`update restaurants set settings = settings - 'attendanceToken' where id = ${demo}`);
  await patchDemoSettings({ features: { attendance: true } });
});

async function kiosk(browser: Browser, url: string) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(url);
  return p;
}

test("personnel check in and out by scanning the check-in QR; the owner sees presence and hours", async ({ browser, page }) => {
  await page.goto("/app/staff");
  await expect(page.getByTestId("attendance-qr")).toBeVisible();
  const [{ token }] = (await sql<{ token: string }>(`select settings->>'attendanceToken' as token from restaurants where id = ${demo}`)) as [{ token: string }];
  const k = await kiosk(browser, `/pointage/${token}`);
  await expect(k.getByTestId("kiosk")).toContainText("Restaurant Démo");
  await k.getByLabel("Matricule").fill("002");
  await k.getByLabel("Code PIN").fill("1234");
  await k.getByTestId("kiosk-submit").click();
  await expect(k.getByTestId("kiosk-result")).toHaveAttribute("data-action", "in");
  await expect(k.getByTestId("kiosk-result")).toContainText("Bonjour Awa");

  await page.reload();
  const awa = page.locator('[data-testid=personnel-row][data-staff-no="2"]');
  await expect(awa.getByTestId("presence")).toContainText("Présent");

  // Same code again = departure.
  await k.getByLabel("Matricule").fill("2");
  await k.getByLabel("Code PIN").fill("1234");
  await k.getByTestId("kiosk-submit").click();
  await expect(k.getByTestId("kiosk-result")).toHaveAttribute("data-action", "out");
  await expect(k.getByTestId("kiosk-result")).toContainText("de présence");
  await page.reload();
  await expect(awa.getByTestId("presence")).toContainText("Absent");
  await expect(page.getByTestId("attendance-row")).toHaveCount(1);
  await expect(page.getByTestId("attendance-row")).toContainText("QR code / QR code");
  await k.context().close();
});

test("5 wrong PINs lock the profile; the owner checks the person in by hand and sets a new PIN", async ({ browser, page }) => {
  const [{ code }] = (await sql<{ code: string }>(`select code from access_codes where restaurant_id = ${demo} and seat_id is null`)) as [{ code: string }];
  // Without the QR: restocool.com/pointage with the numéro RC.
  const k = await kiosk(browser, "/pointage");
  for (let i = 0; i < 5; i++) {
    await k.getByLabel("Numéro RC de l'établissement").fill(`RC-${code}`);
    await k.getByLabel("Matricule").fill("003");
    await k.getByLabel("Code PIN").fill("0000");
    await k.getByTestId("kiosk-submit").click();
    await expect(k.getByTestId("kiosk-error")).toContainText(i < 4 ? `encore ${4 - i} essai` : "bloqué");
  }
  await k.getByLabel("Numéro RC de l'établissement").fill(`RC-${code}`);
  await k.getByLabel("Matricule").fill("003");
  await k.getByLabel("Code PIN").fill("5678");
  await k.getByTestId("kiosk-submit").click();
  await expect(k.getByTestId("kiosk-error")).toContainText("bloqué");

  await page.goto("/app/staff");
  const issa = page.locator('[data-testid=personnel-row][data-staff-no="3"]');
  await expect(issa).toContainText("Bloqué");
  await issa.getByTestId("manual-punch").click();
  await expect(page.getByTestId("staff-ok")).toContainText("Arrivée enregistrée");
  await expect(page.locator('[data-testid=personnel-row][data-staff-no="3"]').getByTestId("presence")).toContainText("Présent");
  await page.locator('[data-testid=personnel-row][data-staff-no="3"]').getByLabel(/Nouveau code PIN/).fill("4321");
  await page.locator('[data-testid=personnel-row][data-staff-no="3"]').getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByTestId("staff-ok")).toContainText("Code PIN enregistré");

  // Unlocked with the new PIN: this records the departure (checked in by the owner).
  await k.getByLabel("Numéro RC de l'établissement").fill(`rc ${code.toLowerCase()}`);
  await k.getByLabel("Matricule").fill("3");
  await k.getByLabel("Code PIN").fill("4321");
  await k.getByTestId("kiosk-submit").click();
  await expect(k.getByTestId("kiosk-result")).toHaveAttribute("data-action", "out");
  await page.reload();
  await expect(page.getByTestId("attendance-row").first()).toContainText("Responsable / Numéro RC");
  await k.context().close();
});

test("the owner adds a person without email (next matricule) and can turn check-in off", async ({ page }) => {
  await page.goto("/app/staff");
  const form = page.getByTestId("add-person");
  await form.getByLabel("Nom").fill("Mariam");
  await form.getByLabel("Code PIN (4 à 6 chiffres)").fill("2468");
  await form.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.getByTestId("staff-ok")).toContainText("matricule 004");
  await expect(page.locator('[data-testid=personnel-row][data-staff-no="4"]')).toContainText("Mariam");

  await page.goto("/app/settings#features");
  await page.getByLabel("Pointage du personnel (arrivée et départ)").uncheck();
  await page.getByTestId("features-form").getByRole("button").last().click();
  await expect(page.getByTestId("features-form").getByRole("status")).toContainText("Enregistré");
  await page.goto("/app/staff");
  await expect(page.getByTestId("attendance-off")).toBeVisible();
  await expect(page.getByTestId("attendance-qr")).toHaveCount(0);
  await expect(page.getByTestId("manual-punch")).toHaveCount(0);
});
