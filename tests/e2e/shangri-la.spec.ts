import { randomBytes, scryptSync, createHash } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { sql } from "./helpers";

/** Every customer and staff feature, on the real Shangri-La menu (286 dishes, 78 photos, tables + rooms). */
test.describe.configure({ mode: "serial" });

const SLUG = "shangri-la";
const N = "\u202f";
const rid = async () => (await sql<{ id: string }>("select id from restaurants where slug = $1", [SLUG]))[0]!.id;

async function reset() {
  const id = await rid();
  await sql("delete from orders where restaurant_id = $1", [id]);
  await sql("update table_sessions set status = 'closed', closed_at = now(), closed_reason = 'staff' where status = 'open' and restaurant_id = $1", [id]);
  await sql("update menu_items set sold_out_until = null where restaurant_id = $1", [id]);
}
test.beforeEach(reset);

async function seatToken(type: string, label: string) {
  const [s] = await sql<{ qr_token: string }>("select qr_token from seats where restaurant_id = $1 and type = $2 and label = $3", [await rid(), type, label]);
  return s!.qr_token;
}

async function phone(browser: Browser, path = `/r/${SLUG}`): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript((s) => sessionStorage.setItem(`rc-welcome-${s}`, "1"), SLUG);
  const p = await ctx.newPage();
  await p.goto(path);
  return p;
}

const dish = (p: Page, name: string) => p.getByTestId("menu-item").filter({ has: p.getByTestId("dish-name").getByText(name, { exact: true }) });
async function add(p: Page, name: string) {
  await p.getByTestId("menu-search").fill(name);
  await dish(p, name).getByTestId("add-button").click();
  await p.getByTestId("menu-search").fill("");
}

/** A Shangri-La server with a PIN, logged in on an authorised tablet (like the restaurant would). */
async function serverTablet(browser: Browser): Promise<Page> {
  const id = await rid();
  const salt = randomBytes(16);
  const pinHash = `scrypt$${salt.toString("base64")}$${scryptSync("1357", salt, 32).toString("base64")}`;
  const [m] = await sql<{ n: number }>("select coalesce(max(staff_no), 0) + 1 as n from members where restaurant_id = $1", [id]);
  const [role] = await sql<{ id: string }>("select id from job_roles where restaurant_id = $1 and key = 'server'", [id]);
  await sql(
    `insert into members (restaurant_id, role, name, staff_no, pin_hash, job_role_id, active)
     select $1, 'server', 'Li (serveuse)', $2, $3, $4, true
     where not exists (select 1 from members where restaurant_id = $1 and name = 'Li (serveuse)')`,
    [id, m!.n, pinHash, role?.id ?? null],
  );
  await sql("update members set pin_hash = $2, locked_until = null, pin_failures = 0 where restaurant_id = $1 and name = 'Li (serveuse)'", [id, pinHash]);
  const token = `e2e-shangri-la-tablet-${"y".repeat(24)}`;
  await sql(
    "insert into devices (restaurant_id, name, token_hash) values ($1, 'Tablette salle', $2) on conflict (token_hash) do update set revoked_at = null",
    [id, createHash("sha256").update(token).digest("hex")],
  );
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  await ctx.addCookies([{ name: "rc_device", value: token, domain: "localhost", path: "/" }]);
  const t = await ctx.newPage();
  await t.goto("/poste");
  await t.getByTestId("poste-person").filter({ hasText: "Li (serveuse)" }).click();
  await expect(t.getByTestId("pin-form")).toBeVisible();
  await t.waitForLoadState("networkidle");
  for (const d of "1357") await t.getByTestId(`pin-key-${d}`).click();
  await t.getByTestId("pin-submit").click();
  await expect(t).not.toHaveURL(/\/poste/);
  return t;
}

test("menu: 16 categories, photos, search in 3 languages, spicy filter, prices in FCFA", async ({ page }) => {
  await page.addInitScript((s) => sessionStorage.setItem(`rc-welcome-${s}`, "1"), SLUG);
  await page.goto(`/r/${SLUG}`);
  await expect(page.getByTestId("menu-item")).toHaveCount(286);
  await expect(page.getByTestId("menu-item").locator("img").first()).toBeVisible();

  const search = page.getByTestId("menu-search");
  await search.fill("bœuf sauce piquante");
  await expect(dish(page, "Filet de bœuf sauce piquante")).toContainText(`5${N}300${N}F`);
  await search.fill("香辣牛柳");
  await expect(page.getByTestId("dish-name").first()).toHaveText("Filet de bœuf sauce piquante");
  await search.fill("hot pot");
  await expect(page.getByTestId("menu-item").first()).toBeVisible();
  await search.fill("");
  await page.getByRole("button", { name: /Pimenté/ }).click();
  for (const card of (await page.getByTestId("menu-item").all()).slice(0, 10)) await expect(card).toContainText("🌶️");
  await page.getByRole("button", { name: /Pimenté/ }).click();

  // Photo full screen, then the language switch (Chinese names stay under the French one, for staff).
  await page.getByTestId("menu-item").locator("button[aria-label^='Photo de']").first().click();
  await expect(page.getByTestId("lightbox")).toContainText("1 / ");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "中文", exact: true }).or(page.getByRole("button", { name: "ZH", exact: true })).click();
  await expect(dish(page, "香辣牛柳").first()).toContainText("Filet de bœuf sauce piquante");
});

test("selection: Champagne variants, « sur demande » never 0 F, contact and fortune cookie", async ({ page, context }) => {
  await page.addInitScript((s) => sessionStorage.setItem(`rc-welcome-${s}`, "1"), SLUG);
  await page.goto(`/r/${SLUG}`);
  await page.getByTestId("menu-search").fill("Champagne");
  await dish(page, "Champagne").getByTestId("add-button").click();
  await expect(page.getByTestId("variant-sheet")).toContainText(`78${N}000${N}F`);
  await page.getByTestId("variant-sheet").getByText(/78.000/).first().click();
  await page.getByTestId("variant-confirm").click();
  await expect(page.getByTestId("cart-total")).toHaveText(`78${N}000${N}F`);
  await page.getByTestId("menu-search").fill("Cognac");
  await expect(dish(page, "Cognac")).toContainText("Sur demande");
  await dish(page, "Cognac").getByTestId("add-button").click();
  await expect(page.getByTestId("cart-total")).toHaveText(`78${N}000${N}F +`);
  await page.getByTestId("cart-bar").click();
  await expect(page.getByTestId("cart-sheet")).not.toContainText(/(^|[^\d\s\u202f])\s*0\s*F/);
  await page.goBack();

  const contact = page.locator("#contact");
  await expect(contact.getByRole("link", { name: "+226 77 29 98 78" }).first()).toHaveAttribute("href", "tel:+22677299878");
  await expect(page.getByTestId("open-status")).toHaveCount(0); // no opening hours entered yet
  await page.getByTestId("fortune-button").click();
  await expect(page.getByTestId("fortune-sheet")).toContainText("«");
  await page.keyboard.press("Escape");

  // Takeaway by WhatsApp to the restaurant's number.
  await context.route("https://wa.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "ok" }));
  await page.getByTestId("cart-bar").click();
  await page.getByRole("button", { name: /ommander à emporter/ }).click();
  await page.getByLabel("Votre nom").fill("Awa");
  await page.getByLabel("Heure de retrait").fill("19:30");
  const popup = context.waitForEvent("page");
  await page.getByRole("button", { name: "Envoyer sur WhatsApp" }).click();
  const url = decodeURIComponent((await popup).url());
  expect(url).toContain("wa.me/22677299878");
  expect(url).toContain("Champagne");
});

test("table 7 QR: order, « Montrer au serveur », the server confirms on the tablet, kitchen, served — live on the phone", async ({ browser }) => {
  test.slow();
  const p = await phone(browser, `/r/${SLUG}/t/${await seatToken("table", "7")}`);
  await expect(p.getByTestId("seat-badge")).toContainText("Table 7", { timeout: 25_000 });
  await add(p, "Poulet sauce piquante");
  await add(p, "Champignons noirs sautés");
  await p.getByTestId("cart-bar").click();
  await expect(p.getByTestId("cart-total")).toHaveText(`10${N}800${N}F`);
  await p.getByTestId("send-order").click();
  await expect(p.getByTestId("orders-sheet")).toBeVisible();
  await expect(p.getByTestId("my-order").first()).toHaveAttribute("data-status", "sent");

  // « Montrer au serveur »: big seat, the dishes (with the Chinese name for the kitchen), a scannable QR.
  await p.getByTestId("show-server").first().click();
  const view = p.getByTestId("server-view");
  await expect(p.getByTestId("server-seat")).toHaveText("Table 7");
  await expect(view).toContainText("Poulet sauce piquante");
  await expect(view).toContainText("香辣鸡丁");
  const qr = view.locator("img");
  await expect.poll(() => qr.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const [o] = await sql<{ id: string }>("select id from orders where restaurant_id = $1", [await rid()]);
  await view.getByRole("button", { name: "Fermer" }).click();
  await expect(view).toHaveCount(0);
  if (!(await p.getByTestId("orders-sheet").count())) await p.getByTestId("my-orders-button").click();

  // The server (PIN on the tablet) opens what the QR points to and confirms.
  const t = await serverTablet(browser);
  await t.goto(`/app/orders/${o!.id}`);
  const card = t.getByTestId("order-card");
  await expect(card).toHaveAttribute("data-status", "sent");
  await expect(card.getByTestId("seat-big")).toHaveText("7");
  await card.getByTestId("action-confirmed").click();
  await expect(p.getByTestId("my-order").first()).toHaveAttribute("data-status", "confirmed", { timeout: 15_000 });

  await t.goto("/app/service");
  await expect(t.getByTestId("live-status")).toContainText("En direct");
  // Through the steps the service board offers (preparing / ready / served), up to « servie ».
  const live = t.getByTestId("order-card").filter({ hasText: "Poulet sauce piquante" });
  for (let i = 0; i < 4; i++) {
    if ((await live.getAttribute("data-status")) === "served") break;
    const next = live.locator("[data-testid=action-served], [data-testid=action-ready], [data-testid=action-preparing]").first();
    const before = await live.getAttribute("data-status");
    await next.click();
    await expect(live).not.toHaveAttribute("data-status", before!);
  }
  await expect(p.getByTestId("served")).toContainText("Vous avez été servi", { timeout: 15_000 });
  for (const x of [p, t]) await x.context().close();
});

test("private room 601: two phones scan the same room and share one bill", async ({ browser }) => {
  const token = await seatToken("room", "601");
  const a = await phone(browser, `/r/${SLUG}/t/${token}`);
  await expect(a.getByTestId("seat-badge")).toContainText("601", { timeout: 25_000 });
  await add(a, "Poulet sauce piquante");
  await a.getByTestId("cart-bar").click();
  await a.getByTestId("send-order").click();
  await expect(a.getByTestId("orders-sheet")).toBeVisible();

  const b = await phone(browser, `/r/${SLUG}/t/${token}`);
  await expect(b.getByTestId("seat-badge")).toContainText("601", { timeout: 25_000 });
  await add(b, "Filet de bœuf sauce piquante");
  await b.getByTestId("cart-bar").click();
  await b.getByTestId("send-order").click();
  await expect(b.getByTestId("table-bill")).toContainText(`10${N}600${N}F`);
  await expect(a.getByTestId("orders-sheet").getByTestId("my-order")).toHaveCount(2);
  for (const x of [a, b]) await x.context().close();
});

test("main QR (numéro RC): the customer picks a table; a table already taken asks before joining", async ({ browser }) => {
  const a = await phone(browser);
  await a.getByTestId("choose-seat").click();
  await a.getByTestId("seat-picker").getByRole("button", { name: "Table 3", exact: true }).click();
  await expect(a.getByTestId("seat-badge")).toContainText("Table 3");

  const b = await phone(browser);
  await b.getByTestId("choose-seat").click();
  await b.getByTestId("seat-picker").getByRole("button", { name: "Table 3 (Occupée)" }).click();
  const dialog = b.getByTestId("occupied-dialog");
  await expect(dialog).toContainText("La table 3 est déjà prise");
  await dialog.getByRole("button", { name: "Oui, nous sommes ensemble" }).click();
  await expect(b.getByTestId("seat-badge")).toContainText("Table 3");

  // Rooms are in the picker too (red plates), and takeaway.
  await b.getByTestId("seat-badge").getByRole("button", { name: "Changer" }).click();
  await expect(b.getByTestId("seat-picker").getByRole("button", { name: /^Salon 601/ })).toBeVisible();
  await expect(b.getByTestId("seat-picker").getByRole("button", { name: /À emporter/ })).toBeVisible();
  for (const x of [a, b]) await x.context().close();
});

test("a customer who scanned table 7 can change to table 8; a reload keeps table 8", async ({ browser }) => {
  const p = await phone(browser, `/r/${SLUG}/t/${await seatToken("table", "7")}`);
  await expect(p.getByTestId("seat-badge")).toContainText("Table 7", { timeout: 25_000 });
  await p.getByTestId("seat-badge").getByRole("button", { name: "Changer" }).click();
  await p.getByTestId("seat-picker").getByRole("button", { name: "Table 8", exact: true }).click();
  await expect(p.getByTestId("seat-badge")).toContainText("Table 8");
  await expect(p).toHaveURL(new RegExp(`/r/${SLUG}$`));
  await p.reload();
  await expect(p.getByTestId("seat-badge")).toContainText("Table 8");
  // Table 7 was released: another phone can take it without the « déjà prise » warning.
  const q = await phone(browser);
  await q.getByTestId("choose-seat").click();
  await expect(q.getByTestId("seat-picker").getByRole("button", { name: "Table 7", exact: true })).toBeVisible();
  for (const x of [p, q]) await x.context().close();
});

test("the RC code typed at /c opens Shangri-La; the directory lists it « À la une »", async ({ page }) => {
  const [c] = await sql<{ code: string }>("select code from access_codes where restaurant_id = $1 and seat_id is null", [await rid()]);
  await page.goto(`/c/${c!.code}`);
  await expect(page).toHaveURL(new RegExp(`/r/${SLUG}`));
  await page.goto("/restaurants");
  await expect(page.getByTestId("directory-featured")).toContainText("Shangri-La");
});
