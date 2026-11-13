import { expect, test } from "@playwright/test";
import { consoleNav, sql } from "./helpers";

// One flow per viewport is enough: they share the database.
test.describe.configure({ mode: "serial" });

const demoRc = async () => (await sql<{ code: string }>("select a.code from access_codes a join restaurants r on r.id = a.restaurant_id where r.slug = 'restaurant-demo' and a.seat_id is null"))[0]!.code;

test("collaborators: an owner gives limited access; the collaborator sees only those pages", async ({ page, context }, info) => {
  const email = `agent-${info.project.name}@example.com`;
  await sql("delete from admin_collaborators where email = $1", [email]);
  await page.goto("/admin_pro/team");
  await page.getByTestId("collab-email").fill(email);
  await page.getByTestId("collab-name").fill("Agent Test");
  await page.getByTestId("collab-role-support").check();
  await page.getByTestId("collab-add").click();
  await expect(page.getByTestId("admin-ok")).toBeVisible();
  // No SMTP password in tests: the invitation is written to the outbox, and the page says so.
  await expect(page.getByTestId("invite-status")).toContainText("NOT sent");
  const card = page.getByTestId("admin-collab").filter({ hasText: email });
  await expect(card.getByTestId("collab-role")).toContainText("Support agent");
  await expect(card.getByTestId("collab-invite")).toContainText("not sent");
  // The role can be changed later: Sales & billing replaces the rights.
  await card.getByTestId("collab-role-select").selectOption("sales");
  await card.getByTestId("collab-save").click();
  await page.waitForURL(/ok=collabSaved/);
  const [changed] = await sql<{ role: string; perms: string[] }>("select role, perms from admin_collaborators where email = $1", [email]);
  expect(changed!.role).toBe("sales");
  expect(changed!.perms).toContain("billing.write");
  // Back to support for the rest of the test.
  await page.getByTestId("admin-collab").filter({ hasText: email }).getByTestId("collab-role-select").selectOption("support");
  await page.getByTestId("admin-collab").filter({ hasText: email }).getByTestId("collab-save").click();
  await expect.poll(async () => (await sql<{ role: string }>("select role from admin_collaborators where email = $1", [email]))[0]!.role).toBe("support");
  // The owner's own actions are in the activity log.
  await page.goto(`/admin_pro/team/activity?type=changes`);
  await expect(page.getByTestId("activity-table")).toContainText("Changed a collaborator’s access");
  await expect(page.getByTestId("activity-table")).toContainText("Sent an invitation");
  const [row] = await sql<{ perms: string[] }>("select perms from admin_collaborators where email = $1", [email]);
  expect(row!.perms).toEqual(expect.arrayContaining(["support", "recovery", "businesses.read", "dashboard"]));
  expect(row!.perms).not.toContain("billing.write");

  // Act as that collaborator (dev-only cookie).
  await context.addCookies([{ name: "rc_dev_admin_as", value: email, domain: "localhost", path: "/" }]);
  await page.goto("/admin_pro");
  const nav = await consoleNav(page);
  await expect(nav.getByRole("link", { name: /Requests/ })).toBeVisible();
  await expect(nav.getByRole("link", { name: /Team/ })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: /Settings/ })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: /Subscriptions/ })).toHaveCount(0);
  // A page outside their access sends them back with a notice.
  await page.goto("/admin_pro/team");
  await expect(page).toHaveURL(/denied=1/);
  await expect(page.getByTestId("admin-denied")).toBeVisible();
  // On a business: no payment or suspend controls.
  const [r] = await sql<{ id: string }>("select id from restaurants where slug = 'restaurant-demo'");
  await page.goto(`/admin_pro/businesses/${r!.id}`);
  await expect(page.getByTestId("admin-business")).toBeVisible();
  await expect(page.getByTestId("admin-payment-form")).toHaveCount(0);
  await expect(page.getByTestId("admin-suspend-form")).toHaveCount(0);
  await expect(page.getByTestId("admin-business-live")).toBeVisible();
  // What they opened is in their activity log (seen by the owner).
  await context.clearCookies({ name: "rc_dev_admin_as" });
  await page.goto(`/admin_pro/team/activity?who=${encodeURIComponent(email)}&type=visits`);
  await expect(page.getByTestId("activity-table")).toContainText("Opened a page");
  await context.addCookies([{ name: "rc_dev_admin_as", value: email, domain: "localhost", path: "/" }]);
  // Disabled by the owner: the console is « not found » for them.
  await sql("update admin_collaborators set active = false where email = $1", [email]);
  expect((await page.goto("/admin_pro"))?.status()).toBe(404);
  await sql("delete from admin_collaborators where email = $1", [email]);
});

test("support request: a business reports a blocking problem, TIBLOGICS answers, the business sees it", async ({ page }, info) => {
  const subject = `Commandes bloquées ${info.project.name} ${Date.now()}`;
  await page.goto("/app/support?from=/app/kitchen");
  await page.getByTestId("urgency-high").check({ force: true });
  await page.getByTestId("support-category").selectOption("orders");
  await page.getByTestId("support-subject").fill(subject);
  await page.getByTestId("support-body").fill("Les commandes n’arrivent plus en cuisine depuis 10 minutes.");
  await page.getByTestId("support-submit").click();
  await expect(page.getByTestId("support-sent")).toContainText("D-");
  await expect(page.getByTestId("support-request").filter({ hasText: subject })).toBeVisible();

  // Console: urgent first, with business, person, screen and time.
  await page.goto("/admin_pro/support");
  // Phones get one card per request, wider screens the table.
  const phone = (page.viewportSize()?.width ?? 1024) < 768;
  const row = phone ? page.getByTestId("admin-support-card").filter({ hasText: subject }) : page.getByTestId("admin-support-list").getByRole("row").filter({ hasText: subject });
  await expect(row).toContainText("Restaurant Démo");
  await expect(row).toContainText("Blocking");
  await (phone ? row : row.getByRole("link", { name: subject })).click();
  await expect(page.getByTestId("admin-support-business")).toContainText("Restaurant Démo");
  await expect(page.getByTestId("admin-support-request")).toContainText("/app/kitchen");
  await page.getByTestId("admin-support-body").fill("Bonjour, nous regardons. Rechargez la page cuisine.");
  await page.getByTestId("admin-support-status-select").selectOption("waiting");
  await page.getByTestId("admin-support-send").click();
  await expect(page.getByTestId("admin-ok")).toBeVisible();
  await expect(page.getByTestId("admin-support-status")).toContainText("Waiting");

  // Business: the bell counts the answer; the page shows it.
  await page.goto("/app");
  await expect(page.getByTestId("notification-count").first()).toBeVisible();
  await page.goto("/app/support");
  const card = page.getByTestId("support-request").filter({ hasText: subject });
  await expect(card).toContainText("Rechargez la page cuisine");
  await expect(card.getByTestId("support-status")).toContainText("En attente de vous");
});

test("messages: a new-feature announcement pops up once in the app and is counted as read", async ({ page, context }, info) => {
  // Its own business, so the pop-up never opens over other tests' screens.
  const slug = `popup-${info.project.name}`;
  await sql("delete from restaurants where slug = $1", [slug]);
  const [biz] = await sql<{ id: string }>(
    `insert into restaurants (slug, name, plan, plan_status, published, settings) values ($1, $2, 'pro', 'trial', false, jsonb_build_object('onboardedAt', now()::text)) returning id`,
    [slug, `Popup ${info.project.name}`],
  );
  await sql("insert into members (restaurant_id, clerk_user_id, role, staff_no, name) values ($1, 'dev-owner', 'owner', 1, 'Dev')", [biz!.id]);
  const title = `Nouveau : export PDF ${info.project.name} ${Date.now()}`;
  await page.goto(`/admin_pro/messages?business=${biz!.id}`);
  await page.getByTestId("message-title").fill(title);
  await page.getByTestId("message-body").fill("Exportez votre clôture de caisse en PDF.");
  await page.getByTestId("message-popup").check();
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("message-send").click();
  await expect(page.getByTestId("admin-ok")).toBeVisible();

  // The owner of that business opens the app: the pop-up shows, then not again.
  await context.addCookies([{ name: "rc_restaurant", value: biz!.id, domain: "localhost", path: "/" }]);
  await page.goto("/app/notifications");
  await expect(page.getByTestId("notification-item").filter({ hasText: title })).toBeVisible();
  await sql("delete from platform_message_reads where message_id in (select id from platform_messages where title->>'fr' = $1)", [title]);
  await page.goto("/app/guide");
  const popup = page.getByTestId("notification-popup");
  await expect(popup).toBeVisible();
  await expect(popup).toContainText(title);
  await page.getByTestId("notification-popup-close").click();
  await expect(popup).toBeHidden();
  await page.reload();
  await expect(page.getByTestId("notification-popup")).toBeHidden();
  await context.clearCookies({ name: "rc_restaurant" });

  await page.goto("/admin_pro/messages");
  await expect(page.getByTestId("admin-sent-messages").locator("li").filter({ hasText: title }).getByTestId("message-reads")).toContainText(/Read by 1 of 1/);
  await sql("delete from platform_messages where title->>'fr' = $1", [title]);
  await sql("delete from restaurants where id = $1", [biz!.id]);
});

test("account recovery: wrong answers are refused; right answers allow a new PIN, shown once", async ({ page }, info) => {
  const rc = await demoRc();
  // A throwaway person (never touch the PINs other tests use).
  const who = `Récup ${info.project.name}`;
  await sql("delete from members where name = $1", [who]);
  await sql("insert into members (restaurant_id, name, role, staff_no, active) select id, $1, 'server', 900 + (select count(*) from members m where m.restaurant_id = r.id and m.staff_no >= 900), true from restaurants r where slug = 'restaurant-demo'", [who]);
  await page.goto("/admin_pro/recovery");
  await page.getByTestId("recovery-rc").fill(`RC-${rc}`);
  await page.getByTestId("recovery-rc").press("Enter");
  await expect(page.getByTestId("recovery-business")).toContainText("Restaurant Démo");

  // Only the RC: not verified.
  await page.getByLabel(/Caller’s name/).fill("Inconnu");
  await page.getByTestId("verify-rc").fill(rc);
  await page.getByTestId("verify-name").fill("Autre maquis");
  await page.getByTestId("verify-submit").click();
  await expect(page.getByTestId("recovery-result")).toContainText("Not verified");
  await expect(page.getByTestId("recovery-reset")).toHaveCount(0);

  // RC + name + town + phone: verified.
  await page.getByLabel(/Caller’s name/).fill("Awa");
  await page.getByTestId("verify-rc").fill(`rc-${rc.toLowerCase()}`);
  await page.getByTestId("verify-name").fill("restaurant demo");
  await page.getByTestId("verify-city").fill("ouagadougou");
  await page.getByTestId("verify-phone").fill("+226 70 00 00 01");
  await page.getByTestId("verify-submit").click();
  await expect(page.getByTestId("recovery-result")).toContainText("Identity verified");
  const member = page.getByTestId("recovery-member").filter({ hasText: who });
  page.once("dialog", (d) => d.accept());
  await member.getByTestId("recovery-reset").click();
  await expect(page.getByTestId("recovery-pin")).toBeVisible();
  expect(await page.getByTestId("recovery-pin").locator("p.font-mono").innerText()).toMatch(/^\d{6}$/);
  const [c] = await sql<{ actions: Array<{ action: string }> }>("select actions from recovery_cases order by created_at desc limit 1");
  expect(c!.actions.map((a) => a.action)).toContain("pin_reset");
  const [m] = await sql<{ pin_hash: string | null }>("select pin_hash from members where name = $1", [who]);
  expect(m!.pin_hash).toMatch(/^scrypt\$/);
  await sql("delete from members where name = $1", [who]);
});

test("live view: an open app screen is counted; per-business orders waiting and processed", async ({ page }) => {
  await page.goto("/app");
  await page.waitForTimeout(500);
  await page.goto("/admin_pro/live");
  await expect(page.getByTestId("live-online")).toBeVisible();
  expect(Number((await page.getByTestId("live-team").locator("p").nth(1).innerText()).trim())).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId("live-pending")).toBeVisible();
  await expect(page.getByTestId("live-processed")).toBeVisible();
  await expect(page.getByTestId("chart-last-hour")).toBeVisible();
});

test("public: a locked-out person sends a request with their numéro RC; it reaches the inbox, matched", async ({ page }, info) => {
  const rc = await demoRc();
  const name = `Moussa ${info.project.name} ${Date.now()}`;
  await page.goto("/aide");
  await page.getByTestId("aide-rc").fill(`RC-${rc}`);
  await page.getByLabel(/Nom de l’établissement/).fill("Restaurant Démo");
  await page.getByLabel(/Votre nom complet/).fill(name);
  await page.getByLabel(/Votre téléphone/).fill("+226 70 11 22 33");
  await page.getByLabel(/Que se passe-t-il/).fill("J’ai oublié mon code PIN.");
  await page.getByTestId("aide-submit").click();
  await expect(page.getByTestId("aide-sent")).toContainText("D-");
  const [r] = await sql<{ restaurant_id: string | null; category: string }>("select restaurant_id, category from support_requests where name = $1", [name]);
  expect(r!.restaurant_id).not.toBeNull();
  expect(r!.category).toBe("access");
});

test("numéro RC: businesses are suggested while typing; menus opened are listed to reopen", async ({ page }) => {
  const rc = await demoRc();
  await page.goto("/r/restaurant-demo");
  await page.goto("/");
  await expect(page.getByTestId("recent-places")).toContainText("Restaurant Démo");
  await page.getByTestId("code-input").fill(rc.slice(0, 2));
  const list = page.getByTestId("code-suggestions");
  await expect(list).toContainText("Restaurant Démo");
  await list.getByRole("option").filter({ hasText: "Restaurant Démo" }).click();
  await expect(page).toHaveURL(/\/r\/restaurant-demo/);
});
