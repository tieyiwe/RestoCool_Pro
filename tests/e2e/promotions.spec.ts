import { expect, test } from "@playwright/test";
import { openMenu, resetDemoOrders, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

test("console marketing: a home-page campaign shows and counts views/taps; a business is featured by hand", async ({ page }, info) => {
  const title = `Campagne ${info.project.name} ${Date.now()}`;
  await sql("delete from promotions where scope = 'platform'");
  await page.goto("/admin_pro/marketing");
  await page.getByTestId("campaign-placement-home_hero").check();
  await page.getByTestId("campaign-title").fill(title);
  await page.getByTestId("campaign-business").selectOption({ label: "Restaurant Démo · Ouagadougou" });
  await page.getByTestId("campaign-create").click();
  await expect(page.getByTestId("admin-ok")).toBeVisible();
  await expect(page.getByTestId("campaign-row").filter({ hasText: title })).toContainText("Live");

  // Home page: the big card links to the business.
  await page.goto("/");
  const hero = page.getByTestId("promo-home-hero");
  await expect(hero).toContainText(title);
  await expect(hero.getByRole("link")).toHaveAttribute("href", "/r/restaurant-demo");
  await hero.getByRole("link").click();
  await expect(page).toHaveURL(/\/r\/restaurant-demo/);
  await expect.poll(async () => (await sql<{ views: number; clicks: number }>("select views, clicks from promotions where title->>'fr' = $1", [title]))[0], { timeout: 15_000 }).toMatchObject({ views: 1, clicks: 1 });

  // Manual featuring: slot 1 (the featured order is put back afterwards for the other tests).
  const before = await sql<{ id: string; featured_rank: number | null }>("select id, featured_rank from restaurants where featured_rank is not null");
  await page.goto("/admin_pro/marketing");
  await page.getByTestId("featured-slot-1").selectOption({ label: "Restaurant Démo · Ouagadougou" });
  await page.getByTestId("featured-save-1").click();
  await expect(page.getByTestId("admin-ok")).toBeVisible();
  const [r] = await sql<{ featured_rank: number }>("select featured_rank from restaurants where slug = 'restaurant-demo'");
  expect(r!.featured_rank).toBe(1);
  await sql("update restaurants set featured_rank = null where featured_rank is not null");
  for (const b of before) await sql("update restaurants set featured_rank = $2 where id = $1", [b.id, b.featured_rank]);
  await sql("delete from promotions where scope = 'platform'");
});

test("owner promotions (Business plan): a dish offer shows at the top of the page, the dish shows the old price struck, orders pay the promo price", async ({ page, browser }, info) => {
  await resetDemoOrders();
  await sql("delete from promotions where scope = 'business'");
  // Pro: the page explains it is a Business feature.
  await sql("update restaurants set plan = 'pro' where slug = 'restaurant-demo'");
  await page.goto("/app/promotions");
  await expect(page.getByTestId("promos-upsell")).toBeVisible();
  await sql("update restaurants set plan = 'business' where slug = 'restaurant-demo'");
  try {
    await page.goto("/app/promotions");
    const [item] = await sql<{ id: string; price: number }>("select id, price from menu_items where restaurant_id = (select id from restaurants where slug = 'restaurant-demo') and name->>'fr' ilike 'Jus de bissap%' limit 1");
    await page.getByTestId("promo-kind-item").check();
    await page.getByTestId("promo-item").selectOption(item!.id);
    await page.getByTestId("promo-title").fill(`Bissap en fête ${info.project.name}`);
    await page.getByTestId("promo-badge-input").fill("-50 %");
    await page.getByTestId("promo-price").fill(String(Math.round(item!.price / 2)));
    await page.getByTestId("promo-create").click();
    await expect(page.getByTestId("promo-ok")).toBeVisible();
    await expect(page.getByTestId("promo-row").first().getByTestId("promo-state")).toContainText("En ligne");

    // Customer: « Offres du moment » first, details, add, the order is priced on the server.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const phone = await ctx.newPage();
    await openMenu(phone);
    await expect(phone.getByTestId("promo-strip")).toContainText(`Bissap en fête ${info.project.name}`);
    await phone.getByTestId("promo-card").first().click();
    await expect(phone.getByTestId("promo-details")).toContainText("-50 %");
    await phone.getByTestId("menu-search").fill("bissap").catch(() => {});
    await phone.getByTestId("promo-add").click().catch(() => {});
    await phone.keyboard.press("Escape").catch(() => {});
    await phone.getByTestId("menu-search").fill("bissap");
    const dish = phone.getByTestId("menu-item").filter({ hasText: "bissap" }).first();
    await expect(dish.getByTestId("promo-badge")).toContainText("-50 %");
    await expect(dish.locator("s")).toBeVisible();
    await ctx.close();
    const [p] = await sql<{ views: number }>("select views from promotions where scope = 'business' limit 1");
    expect(p).toBeTruthy();
  } finally {
    await sql("delete from promotions where scope = 'business'");
    await sql("update restaurants set plan = 'pro' where slug = 'restaurant-demo'");
  }
});

test("free plan: a small sponsored RestoCool banner on the menu; never on paid plans", async ({ page }, info) => {
  test.setTimeout(120_000);
  // Its own free business (the shared demo stays on Pro for the other tests).
  const slug = `libre-${info.project.name}`;
  await sql("delete from restaurants where slug = $1", [slug]);
  await sql("insert into restaurants (slug, name, plan, plan_status, published, settings) values ($1, $2, 'gratuit', 'active', true, jsonb_build_object('onboardedAt', now()::text))", [slug, `Maquis libre ${info.project.name}`]);
  await sql("delete from promotions where scope = 'platform'");
  await sql("insert into promotions (scope, placement, title, link, theme, created_by) values ('platform', 'free_menu', '{\"fr\":\"Passez à Pro\"}', '/sign-up', 'green', 'test')");
  try {
    await openMenu(page, "restaurant-demo");
    await expect(page.getByTestId("sponsor-banner")).toHaveCount(0); // Pro: never
    await expect
      .poll(
        async () => {
          await openMenu(page, slug);
          return page.getByTestId("sponsor-banner").count();
        },
        { timeout: 60_000, intervals: [5_000] }, // campaigns are cached 30 s
      )
      .toBe(1);
    await expect(page.getByTestId("sponsor-banner")).toContainText("Passez à Pro");
    await expect(page.getByTestId("sponsor-banner")).toContainText("Sponsorisé");
  } finally {
    await sql("delete from restaurants where slug = $1", [slug]);
    await sql("delete from promotions where scope = 'platform'");
  }
});
