import { expect, test } from "@playwright/test";
import { sql } from "./helpers";

test.describe.configure({ mode: "serial" });

/**
 * A business prepared by RestoCool (no owner): the console invites its owner by email; the link
 * carries the business address; another account is told it is not the right one; the invited
 * email (the dev user here) takes it over and lands in the setup wizard, already prepared.
 */
test("console invites the owner of a prepared business; the invited email takes it over and finishes the setup", async ({ page, context }, info) => {
  test.setTimeout(120_000);
  const name = `Maquis Invité ${info.project.name}`;
  const slug = `invite-${info.project.name}`;
  await sql("delete from restaurants where slug = $1", [slug]);
  const [biz] = await sql<{ id: string }>(
    "insert into restaurants (slug, name, plan, plan_status, published, settings) values ($1, $2, 'pro', 'trial', true, jsonb_build_object('seatingModes', jsonb_build_array('table','takeaway'))) returning id",
    [slug, name],
  );
  const [cat] = await sql<{ id: string }>("insert into menu_categories (restaurant_id, name, sort) values ($1, '{\"fr\":\"Plats\"}', 1) returning id", [biz!.id]);
  await sql("insert into menu_items (restaurant_id, category_id, name, price, sort) values ($1, $2, '{\"fr\":\"Riz gras\"}', 2500, 1)", [biz!.id, cat!.id]);

  try {
    // 1. Console: the business has no owner → the invitation card. First a wrong address.
    await page.goto(`/admin_pro/businesses/${biz!.id}`);
    const card = page.getByTestId("owner-invite-card");
    await expect(card).toBeVisible();
    await card.getByTestId("owner-invite-email").fill("someone@example.com");
    await card.getByTestId("owner-invite-send").click();
    await expect(page.getByTestId("admin-ok")).toBeVisible();
    await expect(page.getByTestId("owner-invite-status")).toContainText("someone@example.com");
    const first = await page.getByTestId("owner-invite-link").inputValue();
    expect(first).toContain(`/r/${slug}/proprietaire/`);

    // 2. The link shows the business; signed in as another account → « pas le bon compte ».
    await page.goto(new URL(first).pathname);
    await expect(page.getByTestId("owner-invite")).toHaveAttribute("data-state", "open");
    await expect(page.getByTestId("owner-invite")).toContainText(name);
    await expect(page.getByTestId("owner-invite-switch")).toBeVisible();
    await expect(page.getByTestId("owner-invite")).toContainText("so•••••@example.com");

    // 3. New link to the right email (the dev user's): the old link stops working.
    await page.goto(`/admin_pro/businesses/${biz!.id}`);
    await page.getByTestId("owner-invite-email").fill("dev@localhost");
    await page.getByTestId("owner-invite-send").click();
    // (The status line also names the sender, the dev admin: wait for the new link instead.)
    await expect(page.getByTestId("owner-invite-link")).not.toHaveValue(first);
    await expect(page.getByTestId("owner-invite-email")).toHaveValue("dev@localhost");
    const link = await page.getByTestId("owner-invite-link").inputValue();
    await page.goto(new URL(first).pathname);
    await expect(page.getByTestId("owner-invite")).toHaveAttribute("data-state", "invalid");

    // 4. The invited email opens the link: owner at once, then the setup wizard of that business.
    await page.goto(new URL(link).pathname);
    await page.waitForURL(/\/app\/onboarding/);
    const [owner] = await sql<{ role: string; staff_no: number }>("select role, staff_no from members where restaurant_id = $1 and clerk_user_id = 'dev-owner'", [biz!.id]);
    expect(owner).toEqual({ role: "owner", staff_no: 1 });
    const cookies = await context.cookies();
    expect(cookies.find((c) => c.name === "rc_restaurant")?.value).toBe(biz!.id);

    // 5. The used link now says it is taken (with a way in); the console card is gone.
    await page.goto(new URL(link).pathname);
    await expect(page.getByTestId("owner-invite")).toHaveAttribute("data-state", "owned");
    await page.goto(`/admin_pro/businesses/${biz!.id}`);
    await expect(page.getByTestId("admin-business")).toBeVisible();
    await expect(page.getByTestId("owner-invite-card")).toHaveCount(0);
  } finally {
    await context.clearCookies({ name: "rc_restaurant" });
    await sql("delete from restaurants where id = $1", [biz!.id]);
  }
});
