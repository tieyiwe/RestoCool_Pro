import { expect, test } from "@playwright/test";
import { sql } from "./helpers";

test.describe.configure({ mode: "serial" });

test("deleting a business: confirm, danger zone with written reason and the name, 72 h, the team confirms, deleted then restored", async ({ page, context }, info) => {
  test.setTimeout(150_000);
  const name = `Maquis Suppr ${info.project.name}`;
  await sql("delete from deletion_requests where business_name = $1", [name]);
  await sql("delete from restaurants where name = $1", [name]);
  const [biz] = await sql<{ id: string }>(
    "insert into restaurants (slug, name, plan, plan_status, published, settings) values ($1, $2, 'pro', 'trial', true, jsonb_build_object('onboardedAt', now()::text)) returning id",
    [`suppr-${info.project.name}`, name],
  );
  await sql("insert into members (restaurant_id, clerk_user_id, role, staff_no, name, email) values ($1, 'dev-owner', 'owner', 1, 'Dev', 'dev@localhost')", [biz!.id]);
  await context.addCookies([{ name: "rc_restaurant", value: biz!.id, domain: "localhost", path: "/" }]);
  page.on("dialog", (d) => d.accept());

  // 1. Settings → a first confirmation → the danger zone.
  await page.goto("/app/settings");
  await page.getByTestId("danger-link").click();
  await expect(page.getByTestId("danger-zone")).toBeVisible();
  const form = page.getByTestId("deletion-form");
  // A one-liner is not enough; the name must be typed exactly.
  await form.getByTestId("deletion-reason").fill("Je ferme mon établissement. Merci pour tout, vraiment.");
  await form.getByTestId("deletion-name").fill(name);
  await form.getByTestId("deletion-understood").check();
  await form.getByTestId("deletion-submit").click();
  // Too short: the form is not even sent (and the server would refuse it too).
  await expect(page.getByTestId("danger-ok")).toHaveCount(0);
  await expect(page.getByTestId("deletion-form")).toBeVisible();
  const reason = "Je ferme définitivement mon maquis à la fin du mois. Je n’aurai plus besoin du menu en ligne ni de l’équipe sur l’application.";
  await page.getByTestId("deletion-reason").fill(reason);
  await page.getByTestId("deletion-name").fill("Autre nom");
  await page.getByTestId("deletion-understood").check();
  await page.getByTestId("deletion-submit").click();
  await expect(page.getByTestId("danger-error")).toContainText("ne correspond pas");
  await page.getByTestId("deletion-reason").fill(reason);
  await page.getByTestId("deletion-name").fill(name.toLowerCase());
  await page.getByTestId("deletion-understood").check();
  await page.getByTestId("deletion-submit").click();
  await expect(page.getByTestId("danger-ok")).toBeVisible();
  await expect(page.getByTestId("deletion-pending")).toContainText("Suppression demandée");
  // Everyone in the app sees it; nothing is deleted yet.
  await page.goto("/app");
  await expect(page.getByTestId("deletion-banner")).toBeVisible();
  const [req] = await sql<{ id: string; effective_at: Date }>("select id, effective_at from deletion_requests where restaurant_id = $1", [biz!.id]);
  expect(new Date(req!.effective_at).getTime() - Date.now()).toBeGreaterThan(71 * 3600_000);

  // 2. The console gets it; the team calls, then confirms (here: once the 72 h are over).
  await page.goto("/admin_pro/deletions");
  const row = page.getByTestId("deletion-row").filter({ hasText: name });
  await expect(row).toContainText(reason);
  await row.getByTestId("deletion-contacted").click();
  await expect(page.getByTestId("admin-ok")).toBeVisible();
  await sql("update deletion_requests set effective_at = now() - interval '1 minute' where id = $1", [req!.id]);
  await page.reload();
  await page.getByTestId("deletion-row").filter({ hasText: name }).getByTestId("deletion-confirm").click();
  await expect(page.getByTestId("deletion-row").filter({ hasText: name }).getByTestId("deletion-status")).toContainText("Deleted");
  const [gone] = await sql<{ deleted_at: Date | null; published: boolean }>("select deleted_at, published from restaurants where id = $1", [biz!.id]);
  expect(gone!.deleted_at).not.toBeNull();
  expect(gone!.published).toBe(false);
  expect((await page.goto(`/r/suppr-${info.project.name}`))?.status()).toBe(404);

  // 3. The owner restores it within the 10 days: back exactly as it was.
  await page.goto("/app/new");
  const card = page.getByTestId("restorable");
  await expect(card).toContainText(name);
  await card.getByTestId("restore-business").click();
  await page.waitForURL(/restored=1/);
  const [back] = await sql<{ deleted_at: Date | null; published: boolean }>("select deleted_at, published from restaurants where id = $1", [biz!.id]);
  expect(back).toMatchObject({ deleted_at: null, published: true });
  expect((await page.goto(`/r/suppr-${info.project.name}`))?.status()).toBe(200);

  await context.clearCookies({ name: "rc_restaurant" });
  await sql("delete from deletion_requests where restaurant_id = $1", [biz!.id]);
  await sql("delete from restaurants where id = $1", [biz!.id]);
});
