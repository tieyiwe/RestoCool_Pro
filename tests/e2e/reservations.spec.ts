import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { sql } from "./helpers";

test.describe.configure({ mode: "serial" });

const DEMO = "(select id from restaurants where slug = 'restaurant-demo')";
const skipWelcome = "sessionStorage.setItem('rc-welcome-restaurant-demo', '1')";
const reset = async () => {
  await sql(`delete from reservations where restaurant_id = ${DEMO}`);
  await sql(`update restaurants set settings = settings - 'reservations' where slug = 'restaurant-demo'`);
};

test.beforeEach(reset);
test.afterAll(reset);

test("the owner opens reservations; a customer books from the page and gets an email; the owner calls and confirms; the customer cancels from the link; the console counts it", async ({ browser, page }) => {
  test.slow();
  // Off by default: no button on the page.
  await page.goto("/app/reservations");
  await expect(page.getByTestId("reservations-state")).toContainText("fermées");
  await page.getByTestId("reservations-enabled").check();
  await page.getByTestId("reservations-save").click();
  await expect(page.getByTestId("reservations-ok")).toContainText("ouvertes");

  // The customer, on a phone.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(skipWelcome);
  const phone = await ctx.newPage();
  await phone.goto("/r/restaurant-demo");
  await phone.getByTestId("reserve-button").click();
  const form = phone.getByTestId("reservation-form");
  await form.getByTestId("resv-day").nth(1).click(); // tomorrow
  await form.getByTestId("resv-slot").first().click();
  const time = (await form.locator('[data-testid="resv-slot"][aria-checked="true"]').innerText()).trim();
  await form.getByTestId("resv-party-plus").click();
  await expect(form.getByTestId("resv-party")).toHaveText("3");
  await expect(form.getByTestId("resv-submit")).toBeDisabled(); // name, email, phone required
  const email = `resv-${Date.now()}@example.com`;
  await form.getByTestId("resv-name").fill("Awa Ouédraogo");
  await form.getByTestId("resv-email").fill(email);
  await form.getByTestId("resv-phone").fill("70 11 22 33");
  await form.getByTestId("resv-note").fill("Anniversaire");
  await form.getByTestId("resv-submit").click();
  await expect(phone.getByTestId("reservation-done")).toBeVisible();
  const ref = (await phone.getByTestId("reservation-ref").innerText()).trim();
  expect(ref).toMatch(/^R-[A-Z2-9]{5}$/);

  // RestoCool's email (in development it is written to .data/outbox).
  const outbox = path.join(process.cwd(), ".data", "outbox");
  await expect
    .poll(() => {
      try {
        return readdirSync(outbox).filter((f) => f.includes(email)).length;
      } catch {
        return 0;
      }
    })
    .toBeGreaterThan(0);
  const html = readFileSync(path.join(outbox, readdirSync(outbox).find((f) => f.includes(email))!), "utf8");
  expect(html).toContain("Restaurant Démo");
  expect(html).toContain(ref);
  expect(html).toContain("/reservation/");

  // The owner: a request to confirm, with tap-to-call; « J'ai appelé » then « Confirmer ».
  await page.goto("/app/reservations");
  const card = page.getByTestId("reservations-waiting").getByTestId("reservation-card").filter({ hasText: "Awa Ouédraogo" });
  await expect(card).toContainText(time);
  await expect(card).toContainText("3 personnes");
  await expect(card).toContainText("Anniversaire");
  await expect(card.getByTestId("resv-call")).toHaveAttribute("href", "tel:+22670112233");
  await card.getByTestId("resv-contacted").click();
  await expect(page.getByTestId("reservations-ok")).toBeVisible();
  await page.getByTestId("reservations-waiting").getByTestId("reservation-card").filter({ hasText: "Awa Ouédraogo" }).getByTestId("resv-confirm").click();
  await expect(page.getByTestId("reservations-ok")).toContainText("confirmée");
  await expect(page.getByTestId("reservations-waiting")).toHaveCount(0);

  // The customer's link shows « Confirmée »; they cancel.
  await phone.getByTestId("reservation-link").click();
  await expect(phone.getByTestId("my-reservation")).toHaveAttribute("data-status", "confirmed");
  await phone.getByTestId("reservation-cancel").click();
  await expect(phone.getByTestId("my-reservation")).toHaveAttribute("data-status", "cancelled");
  expect((await sql<{ status: string }>(`select status from reservations where restaurant_id = ${DEMO} and ref = $1`, [ref]))[0]?.status).toBe("cancelled");

  // The console counts it.
  await page.goto("/admin_pro");
  await expect(page.getByTestId("fu-resv-total")).toBeVisible();
  expect(Number(await page.getByTestId("fu-resv-total").locator("span").last().innerText())).toBeGreaterThanOrEqual(1);
  await ctx.close();
});

test("closed reservations: no button on the page and the API refuses", async ({ page, request }) => {
  await page.addInitScript(skipWelcome);
  await page.goto("/r/restaurant-demo");
  await expect(page.getByTestId("menu-item").first()).toBeVisible();
  await expect(page.getByTestId("reserve-button")).toHaveCount(0);
  const res = await request.post("/api/public/reservations", {
    data: { slug: "restaurant-demo", deviceId: "deviceRESVCLOSEDAAAAAA", date: "2030-01-01", time: "19:00", partySize: 2, name: "Test", email: "t@example.com", phone: "70112233" },
  });
  expect(res.status()).toBe(403);
});
