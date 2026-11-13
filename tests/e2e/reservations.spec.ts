import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { sql } from "./helpers";

test.describe.configure({ mode: "serial" });

const DEMO = "(select id from restaurants where slug = 'restaurant-demo')";
const skipWelcome = "sessionStorage.setItem('rc-welcome-restaurant-demo', '1')";
const reset = async () => {
  await sql(`delete from reservations where restaurant_id = ${DEMO}`);
  await sql(`update restaurants set settings = settings - 'reservations' - 'waitTime' where slug = 'restaurant-demo'`);
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

test("busy day: the wait shows on the page and in the form; confirmed guests get a one-time QR that staff scan; no-shows after the expiry", async ({ browser, page, request }) => {
  test.slow();
  await sql(
    `update restaurants set settings = jsonb_set(settings, '{reservations}', '{"enabled":true,"slotMinutes":30,"maxParty":12,"maxCoversPerSlot":0,"noticeMinutes":0,"daysAhead":30,"expiryMinutes":60}'::jsonb, true) where slug = 'restaurant-demo'`,
  );
  // The owner shows a 45 min wait.
  await page.goto("/app/reservations");
  await page.locator('label:has([data-testid="wait-45"])').click();
  await page.getByTestId("wait-save").click();
  await expect(page.getByTestId("wait-current")).toContainText("45");

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(skipWelcome);
  const phone = await ctx.newPage();
  await phone.goto("/r/restaurant-demo");
  await expect(phone.getByTestId("wait-time")).toContainText("45");
  await phone.getByTestId("reserve-button").click();
  await expect(phone.getByTestId("resv-wait")).toContainText("45");
  const form = phone.getByTestId("reservation-form");
  await form.getByTestId("resv-day").nth(1).click();
  await form.getByTestId("resv-slot").first().click();
  const email = `qr-${Date.now()}@example.com`;
  await form.getByTestId("resv-name").fill("Moussa Kaboré");
  await form.getByTestId("resv-email").fill(email);
  await form.getByTestId("resv-phone").fill("76 00 11 22");
  await form.getByTestId("resv-submit").click();
  await expect(phone.getByTestId("reservation-done")).toBeVisible();

  // The owner confirms: the confirmation email carries the QR.
  await page.goto("/app/reservations");
  await page.getByTestId("reservations-waiting").getByTestId("reservation-card").filter({ hasText: "Moussa Kaboré" }).getByTestId("resv-confirm").click();
  await expect(page.getByTestId("reservations-ok")).toBeVisible();
  const outbox = path.join(process.cwd(), ".data", "outbox");
  let token = "";
  await expect
    .poll(() => {
      for (const f of readdirSync(outbox).filter((x) => x.includes(email))) {
        const m = readFileSync(path.join(outbox, f), "utf8").match(/\/api\/public\/reservations\/qr\/([A-Za-z0-9_-]+)\.png/);
        if (m) token = m[1]!;
      }
      return token;
    })
    .not.toBe("");
  expect((await request.get(`/api/public/reservations/qr/${token}.png`)).headers()["content-type"]).toBe("image/png");
  // The guest's page shows the QR too.
  await phone.getByTestId("reservation-link").click();
  await expect(phone.getByTestId("reservation-qr")).toBeVisible();
  await expect(phone.getByTestId("reservation-wait")).toContainText("45");

  // Staff scan it (the QR link opens the check-in screen), confirm the arrival, once.
  await page.goto(`/rv/${token}`);
  await expect(page.getByTestId("checkin-screen")).toHaveAttribute("data-state", "valid");
  await page.getByTestId("checkin-confirm").click();
  await expect(page.getByTestId("checkin-screen")).toHaveAttribute("data-state", "done");
  await page.goto(`/rv/${token}`);
  await expect(page.getByTestId("checkin-screen")).toHaveAttribute("data-state", "used");
  expect((await request.get(`/api/public/reservations/qr/${token}.png`)).status()).toBe(404);
  // Someone outside the team (often the guest) only gets « show it to the staff », never the details.
  await page.goto(`/rv/${token}/aide?state=guest`);
  await expect(page.getByTestId("rv-help")).toContainText("montrez-le au personnel");
  await expect(page.getByTestId("rv-help")).not.toContainText("Moussa");
  await phone.reload();
  await expect(phone.getByTestId("reservation-checked-in")).toBeVisible();
  await expect(phone.getByTestId("reservation-qr")).toHaveCount(0);

  // A confirmed guest who never came: past the time + 60 min, « Absent ».
  await sql(
    `insert into reservations (restaurant_id, ref, date, time, party_size, name, email, phone, status, token_hash)
     values (${DEMO}, 'R-NOSHW', (now() at time zone 'UTC')::date - 1, '12:00', 2, 'Absent Test', 'a@example.com', '22670000000', 'confirmed', 'e2e-noshow-' || gen_random_uuid())`,
  );
  await page.goto("/app/reservations");
  expect((await sql<{ status: string }>(`select status from reservations where restaurant_id = ${DEMO} and ref = 'R-NOSHW'`))[0]?.status).toBe("no_show");
  await expect(page.getByTestId("stat-today-arrived")).toContainText("1");
  await expect(page.getByTestId("stat-30-noShows")).toContainText("1");
  // The owner's home dashboard shows the day; the console the check-in by QR.
  await page.goto("/app");
  await expect(page.getByTestId("dashboard-reservations")).toContainText("1 arrivées");
  await page.goto("/admin_pro");
  expect(Number(await page.getByTestId("fu-resv-qr").locator("span").last().innerText())).toBeGreaterThanOrEqual(1);
  // Remove the wait.
  await page.goto("/app/reservations");
  await page.getByTestId("wait-clear").click();
  await expect(page.getByTestId("wait-current")).toHaveCount(0);
  await ctx.close();
});

