import { expect, test } from "@playwright/test";
import { sql } from "./helpers";

test.describe.configure({ mode: "serial" });

test("super admin: overview, find a business by name, record a payment, suspend and reactivate, note", async ({ page }) => {
  test.setTimeout(120_000);
  const [before] = await sql<{ id: string; plan: string; plan_status: string; plan_expires_at: Date | null; settings: unknown }>(
    "select id, plan, plan_status, plan_expires_at, settings from restaurants where slug = 'maquis-temoin'",
  );
  try {
    await page.goto("/admin_pro");
    await expect(page.getByTestId("admin-overview")).toBeVisible();
    await expect(page.getByTestId("kpi-businesses")).toContainText(/\d/);
    // English by default, French on demand (remembered), never Chinese.
    await expect(page.getByTestId("admin-funnel")).toContainText("First order");
    await page.getByTestId("admin-lang").getByRole("button", { name: "fr" }).click();
    await expect(page.getByTestId("admin-funnel")).toContainText("Première commande");

    await page.getByTestId("admin-nav").getByRole("link", { name: /Établissements/ }).click();
    await page.getByTestId("admin-search").fill("Témoin");
    await page.getByTestId("admin-filters").getByRole("button", { name: "Filtrer" }).click();
    await expect(page.getByTestId("admin-business-row")).toHaveCount(1);
    await page.getByTestId("admin-business-row").getByRole("link").first().click();
    await expect(page.getByTestId("admin-business")).toBeVisible();

    // A payment received by Orange Money: the plan becomes active.
    const pay = page.getByTestId("admin-payment-form");
    await pay.locator("select[name=plan]").selectOption("pro");
    await pay.locator("input[name=months]").fill("3");
    await page.getByTestId("admin-amount").fill("30 000");
    await pay.locator("input[name=reference]").fill("OM-E2E-1");
    await page.getByTestId("admin-payment-submit").click();
    await expect(page.getByTestId("admin-ok")).toContainText("Paiement enregistré");
    await expect(page.getByTestId("admin-plan-chip")).toContainText("Pro · Actif");
    await expect(page.getByTestId("admin-events")).toContainText("30 000 F");
    await expect(page.getByTestId("admin-events")).toContainText("OM-E2E-1");

    // Suspend with a reason (confirmation), then reactivate.
    await page.getByTestId("admin-suspend-form").locator("input[name=reason]").fill("Test de suspension");
    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("admin-suspend").click();
    await expect(page.getByTestId("admin-ok")).toContainText("suspendu");
    await expect(page.getByTestId("admin-plan-chip")).toContainText("Suspendu");
    page.once("dialog", (d) => void d.accept());
    await page.getByTestId("admin-suspend").click();
    await expect(page.getByTestId("admin-ok")).toContainText("réactivé");

    await page.getByTestId("admin-note").fill("Rappeler vendredi pour le renouvellement.");
    await page.getByTestId("admin-note-submit").click();
    await expect(page.getByTestId("admin-notes")).toContainText("Rappeler vendredi");

    // Billing lists the payment; activity logs the admin actions.
    await page.goto("/admin_pro/billing");
    await expect(page.getByTestId("admin-billing-events")).toContainText("OM-E2E-1");
    await page.goto("/admin_pro/activity?q=admin.");
    await expect(page.getByTestId("admin-audit")).toContainText("admin.payment_recorded");
  } finally {
    await sql("update restaurants set plan = $2, plan_status = $3, plan_expires_at = $4, settings = $5::jsonb where id = $1", [before!.id, before!.plan, before!.plan_status, before!.plan_expires_at, JSON.stringify(before!.settings)]);
    await sql("delete from admin_notes where restaurant_id = $1", [before!.id]);
  }
});

test("super admin: an announcement shows on every business's app; the launch offer can be switched", async ({ page }) => {
  try {
    await page.goto("/admin_pro/settings");
    await page.getByTestId("admin-lang").getByRole("button", { name: "fr" }).click();
    await expect(page.getByTestId("admin-lang").getByRole("button", { name: "fr" })).toHaveAttribute("aria-pressed", "true");
    await page.goto("/admin_pro/settings");
    const form = page.getByTestId("admin-announcement-form");
    await page.getByTestId("admin-announcement-fr").fill("Maintenance ce soir à 23 h : l’app reste disponible.");
    await page.getByTestId("admin-announcement-save").click();
    await expect(page.getByTestId("admin-ok")).toBeVisible();
    await page.goto("/app");
    await expect(page.getByTestId("platform-announcement")).toContainText("Maintenance ce soir");
    await expect(form).toHaveCount(0);

    await page.goto("/admin_pro/settings");
    await expect(page.getByTestId("admin-free-launch-state")).toContainText("Active");
    await page.getByTestId("admin-free-launch").click();
    await expect(page.getByTestId("admin-free-launch-state")).toContainText("Désactivée");
    await page.getByTestId("admin-free-launch").click();
    await expect(page.getByTestId("admin-free-launch-state")).toContainText("Active");
  } finally {
    await sql("delete from platform_settings where key in ('announcement', 'freeLaunch')");
  }
});

test("only the RestoCool team: the console lists businesses on the map page and exports CSV", async ({ page }) => {
  await page.goto("/admin_pro/map");
  await expect(page.getByTestId("admin-map")).toBeVisible();
  const csv = await page.request.get("/api/admin/businesses?q=Restaurant");
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("Restaurant Démo");
});
