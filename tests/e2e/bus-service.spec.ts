import { createHash } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { sql } from "./helpers";

test.describe.configure({ mode: "serial" });

const SLUG = "express-demo";
const skipWelcome = `sessionStorage.setItem('rc-welcome-${SLUG}', '1')`;

/** A tablet already authorised for Express Démo (the device row is created like the owner would). */
async function hostessTablet(browser: Browser, tag: string): Promise<Page> {
  const token = `e2e-bus-device-${tag}-${"x".repeat(24)}`;
  const [r] = await sql<{ id: string }>("select id from restaurants where slug = $1", [SLUG]);
  await sql("insert into devices (restaurant_id, name, token_hash) values ($1, $2, $3) on conflict (token_hash) do update set revoked_at = null", [
    r!.id,
    `Tablette bus ${tag}`,
    createHash("sha256").update(token).digest("hex"),
  ]);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addCookies([{ name: "rc_device", value: token, domain: "localhost", path: "/" }]);
  return ctx.newPage();
}

async function traveler(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(skipWelcome);
  const p = await ctx.newPage();
  const [bus] = await sql<{ qr_token: string }>("select b.qr_token from buses b join restaurants r on r.id = b.restaurant_id where r.slug = $1", [SLUG]);
  await p.goto(`/r/${SLUG}/b/${bus!.qr_token}`);
  return p;
}

async function pickSeat(p: Page, seat: string) {
  await p.getByTestId("choose-seat").click();
  const map = p.getByTestId("traveler-bus-map");
  await expect(map).toBeVisible();
  await map.locator(`[data-seat="${seat}"]`).click();
}

test("on the bus: the hostess starts the trip, travelers pick their seat on the map and order, she confirms her round", async ({ browser }, info) => {
  test.setTimeout(90_000); // three devices (hostess + two travelers) in one test
  const tag = info.project.name.replace(/\W/g, "");
  await sql("update trips set status = 'closed', closed_at = now() where status = 'open' and restaurant_id = (select id from restaurants where slug = $1)", [SLUG]);

  // Fatim logs in on the tablet with her PIN and starts Ouaga → Bobo.
  const tablet = await hostessTablet(browser, tag);
  await tablet.goto("/poste");
  await tablet.getByTestId("poste-person").filter({ hasText: "Fatim" }).click();
  await expect(tablet.getByTestId("pin-form")).toBeVisible();
  await tablet.waitForLoadState("networkidle");
  for (const d of "2468") await tablet.getByTestId(`pin-key-${d}`).click();
  await tablet.getByTestId("pin-submit").click();
  await expect(tablet).toHaveURL(/\/app\/trips$/);
  const start = tablet.getByTestId("trip-start");
  await expect(start.locator("select[name=routeId] option")).toHaveCount(1); // only her itinerary
  await start.getByTestId("trip-start-submit").click();
  await expect(tablet.getByTestId("trips-ok")).toContainText("Voyage démarré");
  await expect(tablet.getByTestId("trip-route")).toHaveText("Ouagadougou → Bobo-Dioulasso");

  // Traveler A: bus QR → seat 5 on the map → riz gras → « Montrer à l'hôtesse ».
  const a = await traveler(browser);
  await pickSeat(a, "5");
  await expect(a.getByTestId("seat-badge")).toContainText("5");
  await a.getByTestId("menu-item").filter({ hasText: "Riz gras au poulet" }).getByRole("button", { name: /^Ajouter/ }).click();
  await a.getByTestId("cart-bar").click();
  await a.getByTestId("send-order").click();
  await expect(a.getByTestId("show-server").first()).toContainText("Montrer à l'hôtesse");

  // Traveler B picks seat 5 by mistake: warned, confirms anyway (each keeps their own bill).
  const b = await traveler(browser);
  await pickSeat(b, "5");
  await expect(b.getByTestId("bus-taken-dialog")).toContainText("Le siège 5 est déjà choisi");
  await b.getByTestId("bus-taken-dialog").getByRole("button", { name: "C'est bien mon siège" }).click();
  await b.getByTestId("menu-item").filter({ hasText: "Jus de bissap" }).getByRole("button", { name: /^Ajouter/ }).click();
  await b.getByTestId("cart-bar").click();
  await b.getByTestId("send-order").click();
  await expect(b.getByTestId("orders-sheet")).toBeVisible();

  // Fatim's round: she scanned traveler A (as the scanner would add it), confirms the round.
  const [trip] = await sql<{ id: string }>("select id from trips where status = 'open' and restaurant_id = (select id from restaurants where slug = $1)", [SLUG]);
  const [orderA] = await sql<{ id: string }>("select o.id from orders o join order_items i on i.order_id = o.id where o.trip_id = $1 and i.name_snapshot->>'fr' = 'Riz gras au poulet'", [trip!.id]);
  // The round, as the scanner builds it (typed link = same path as a camera read).
  await tablet.goto(`/app/scan?trip=${trip!.id}`);
  await expect(tablet.getByTestId("round-bar")).toBeVisible();
  await tablet.waitForLoadState("networkidle");
  const base = new URL(tablet.url()).origin;
  await tablet.getByTestId("scan-manual").fill(`${base}/app/orders/${orderA!.id}`);
  await tablet.getByTestId("scan-manual-go").click();
  await expect(tablet.getByTestId("round-count")).toContainText("1");
  await tablet.getByTestId("round-finish").click();
  await expect(tablet).toHaveURL(new RegExp(`/app/trips/${trip!.id}\\?round=${orderA!.id}`));
  await expect(tablet.getByTestId("round")).toContainText("Sièges : 5");
  await expect(tablet.getByTestId("doubles")).toContainText("Sièges 5");
  await expect(tablet.getByTestId("to-prepare")).toContainText("Riz gras au poulet");
  await tablet.getByTestId("round-confirm").click();
  await expect(tablet.getByTestId("round-ok")).toContainText("1 commande confirmée");
  // Traveler A sees it live.
  await expect(a.getByTestId("orders-sheet")).toContainText("Confirmée", { timeout: 15_000 });

  // Everything served, then the trip ends and the seats are free again.
  await tablet.getByTestId("confirm-all").click();
  await tablet.getByTestId("serve-all").click();
  await expect(tablet.getByTestId("round-ok")).toContainText("servie");
  await tablet.goto("/app/trips");
  tablet.once("dialog", (d) => void d.accept());
  await tablet.getByTestId("trip-end").click();
  await expect(tablet.getByTestId("trips-ok")).toContainText("Voyage terminé");
  for (const p of [tablet, a, b]) await p.context().close();
});

test("before the trip starts, travelers can read the menu but are told the service hasn't begun", async ({ browser }) => {
  await sql("update trips set status = 'closed', closed_at = now() where status = 'open' and restaurant_id = (select id from restaurants where slug = $1)", [SLUG]);
  const p = await traveler(browser);
  await p.getByTestId("choose-seat").click();
  await expect(p.getByTestId("bus-no-trip")).toContainText("n'a pas encore commencé");
  await p.context().close();
});
