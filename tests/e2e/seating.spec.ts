import { expect, test } from "@playwright/test";
import { patchDemoSettings, resetDemoSessions, seatToken, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

const skipWelcome = "sessionStorage.setItem('rc-welcome-restaurant-demo', '1')";

test.beforeEach(async () => {
  await resetDemoSessions();
});
test.afterAll(async () => {
  await patchDemoSettings({ qrStrategy: "per_seat", seatingModes: ["table", "area", "room", "takeaway"], inactivity: { warnAfterSec: 240, releaseAfterSec: 30 } });
  await resetDemoSessions();
});

test("owner bulk-adds tables, downloads a QR, prints the kit, and a regenerated QR stops the old card", async ({ page, browser }) => {
  await page.goto("/app/seating");
  const add = page.getByTestId("add-tables");
  await add.getByLabel("De").fill("11");
  await add.getByLabel("à", { exact: true }).fill("14");
  await add.getByLabel("Sauf (numéros)").fill("13");
  await add.getByRole("button", { name: "Ajouter les tables" }).click();
  await expect(page.getByRole("status").filter({ hasText: /table\(s\) ajoutée\(s\)/ })).toBeVisible();
  await expect(page.getByTestId("seats-table").getByTestId("seat-row")).toHaveCount(13);

  const row = page.getByTestId("seat-row").filter({ hasText: /^11/ });
  const png = await page.request.get((await row.getByRole("link", { name: "Télécharger" }).getAttribute("href"))!);
  expect(png.headers()["content-type"]).toBe("image/png");

  await page.goto("/app/seating/print?layout=grid");
  await expect(page.getByTestId("print-card")).toHaveCount(16); // 13 tables + 3 salons
  await expect(page.getByTestId("print-card").first()).toContainText("打开手机相机");

  // Regenerate table 11's QR: the old link no longer seats anyone.
  const oldToken = await seatToken("11");
  await page.goto("/app/seating");
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("seat-row").filter({ hasText: /^11/ }).getByRole("button", { name: "Nouveau QR" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Nouveau QR code créé" })).toBeVisible();
  expect(await seatToken("11")).not.toBe(oldToken);
  const ctx = await browser.newContext();
  await ctx.addInitScript(skipWelcome);
  const p = await ctx.newPage();
  await p.goto(`/r/restaurant-demo/t/${oldToken}`);
  await expect(p.getByText("Ce QR code n’est plus valide")).toBeVisible();
  await expect(p.getByTestId("seat-badge")).toHaveCount(0);
  await ctx.close();
});

test("scanning a table QR seats the phone; a second phone joins the same table", async ({ browser }) => {
  const token = await seatToken("7");
  const a = await browser.newContext();
  await a.addInitScript(skipWelcome);
  const pa = await a.newPage();
  await pa.goto(`/r/restaurant-demo/t/${token}`);
  await expect(pa.getByTestId("seat-badge")).toContainText("Table 7");
  await expect(pa.getByTestId("seat-badge").getByRole("button", { name: "Changer" })).toHaveCount(0);

  const b = await browser.newContext();
  await b.addInitScript(skipWelcome);
  const pb = await b.newPage();
  await pb.goto(`/r/restaurant-demo/t/${token}`);
  await expect(pb.getByText("Vous avez rejoint la table.")).toBeVisible();
  await expect(pb.getByTestId("seat-badge")).toContainText("Table 7");

  // The owner sees one occupied table with two phones.
  const owner = await browser.newPage();
  await owner.goto("/app/seating");
  await expect(owner.getByTestId("open-sessions")).toContainText("2 téléphones");
  await a.close();
  await b.close();
  await owner.close();
});

test("generic QR: the picker warns when a table is taken; « Rejoindre » or « Choisir une autre »", async ({ browser }) => {
  await patchDemoSettings({ qrStrategy: "generic" });
  const a = await browser.newContext();
  await a.addInitScript(skipWelcome);
  const pa = await a.newPage();
  await pa.goto("/r/restaurant-demo");
  await pa.getByTestId("choose-seat").click();
  await pa.getByTestId("seat-picker").getByRole("button", { name: "Table 3", exact: true }).click();
  await expect(pa.getByTestId("seat-badge")).toContainText("Table 3");

  const b = await browser.newContext();
  await b.addInitScript(skipWelcome);
  const pb = await b.newPage();
  await pb.goto("/r/restaurant-demo");
  await pb.getByTestId("choose-seat").click();
  await pb.getByTestId("seat-picker").getByRole("button", { name: "Table 3 (Occupée)" }).click();
  const dialog = pb.getByTestId("occupied-dialog");
  await expect(dialog).toContainText("Cette table est déjà occupée");
  await dialog.getByRole("button", { name: "Choisir une autre" }).click();
  await pb.getByTestId("seat-picker").getByRole("button", { name: "Table 4", exact: true }).click();
  await expect(pb.getByTestId("seat-badge")).toContainText("Table 4");

  // Changing to table 3 again, this time joining.
  await pb.getByTestId("seat-badge").getByRole("button", { name: "Changer" }).click();
  await pb.getByTestId("seat-picker").getByRole("button", { name: "Table 3 (Occupée)" }).click();
  await pb.getByTestId("occupied-dialog").getByRole("button", { name: "Rejoindre" }).click();
  await expect(pb.getByTestId("seat-badge")).toContainText("Table 3");
  await a.close();
  await b.close();
});

test("counter: the customer gives a first name", async ({ browser }) => {
  await patchDemoSettings({ qrStrategy: "generic", seatingModes: ["table", "room", "counter", "takeaway"] });
  await sql(
    "insert into seats (restaurant_id, type, label, qr_token) select id, 'counter', 'Comptoir', 'e2e-counter-token-123456' from restaurants where slug = 'restaurant-demo' on conflict do nothing",
  );
  const ctx = await browser.newContext();
  await ctx.addInitScript(skipWelcome);
  const p = await ctx.newPage();
  await p.goto("/r/restaurant-demo");
  await p.getByTestId("choose-seat").click();
  await p.getByTestId("seat-picker").getByRole("button", { name: /^Comptoir/ }).click();
  await p.getByLabel("Votre prénom").fill("Awa");
  await p.getByRole("button", { name: "Valider" }).click();
  await expect(p.getByTestId("seat-badge")).toContainText("Comptoir · Awa");
  await ctx.close();
});

test("inactivity release: « Êtes-vous toujours là ? », « Je suis là » keeps the seat, silence frees it", async ({ browser }) => {
  await patchDemoSettings({ qrStrategy: "generic", inactivity: { warnAfterSec: 3, releaseAfterSec: 3 } });
  const ctx = await browser.newContext();
  await ctx.addInitScript(skipWelcome);
  const p = await ctx.newPage();
  await p.goto("/r/restaurant-demo");
  await p.getByTestId("choose-seat").click();
  await p.getByTestId("seat-picker").getByRole("button", { name: "Table 9", exact: true }).click();
  await expect(p.getByTestId("seat-badge")).toContainText("Table 9");

  const warn = p.getByTestId("still-there");
  await expect(warn).toBeVisible({ timeout: 6000 });
  await expect(warn).toContainText("Êtes-vous toujours là ?");
  await warn.getByRole("button", { name: "Je suis là" }).click();
  await expect(warn).toHaveCount(0);
  await expect(p.getByTestId("seat-badge")).toContainText("Table 9");

  await expect(warn).toBeVisible({ timeout: 6000 });
  await expect(p.getByText("Votre place a été libérée.")).toBeVisible({ timeout: 6000 });
  await expect(p.getByTestId("seat-badge")).toHaveCount(0);
  await expect
    .poll(async () => (await sql("select 1 from table_sessions ts join seats s on s.id = ts.seat_id where s.label = '9' and s.type = 'table' and ts.status = 'open'")).length)
    .toBe(0);
  await ctx.close();
});

test("public seat endpoints validate input and never leak tokens", async ({ request }) => {
  const seats = await request.get("/api/public/r/restaurant-demo/seats");
  expect(seats.ok()).toBe(true);
  const text = await seats.text();
  expect(text).not.toContain(await seatToken("7"));
  expect((await request.post("/api/public/sessions", { data: { slug: "restaurant-demo", deviceId: "x", token: "y" } })).status()).toBe(400);
  expect((await request.post("/api/public/sessions", { data: { slug: "restaurant-demo", deviceId: "abcdefghijklmnopqrst", token: "nope-nope-nope-nope-nope" } })).status()).toBe(404);
  expect((await request.get("/api/public/r/maquis-temoin/seats")).status()).toBe(404); // unpublished, Gratuit
});
