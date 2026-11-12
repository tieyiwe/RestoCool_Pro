import { expect, test } from "@playwright/test";
import { openMenu, sql } from "./helpers";

test("the owner picks a palette (main + accent colour) and the public menu shows it", async ({ page }) => {
  const [before] = await sql<{ accent_color: string; theme: string; settings: { accent2?: string } }>(
    "select accent_color, theme, settings from restaurants where slug = 'restaurant-demo'",
  );
  try {
    await page.goto("/app/settings");
    const form = page.getByTestId("appearance-form");
    await form.locator("input[name=theme][value=warm]").locator("..").click();
    await form.getByTestId("palette-bissap").click();
    await expect(form.getByTestId("palette-bissap")).toHaveAttribute("aria-pressed", "true");
    await expect(form.getByTestId("main-color")).toHaveValue("#8e1b3a");
    await expect(form.getByTestId("accent2-color")).toHaveValue("#e9b530");
    // The live preview takes the colours at once.
    await expect(page.getByTestId("branding-preview")).toContainText("Nouveau");
    // The dark theme offers its own palettes (light colours that read on dark).
    await form.locator("input[name=theme][value=lacquer]").locator("..").click();
    await expect(form.getByTestId("palette-laque")).toBeVisible();
    await expect(form.getByTestId("palette-bissap")).toHaveCount(0);
    await form.locator("input[name=theme][value=warm]").locator("..").click();
    await form.getByTestId("palette-bissap").click();
    await form.getByRole("button", { name: "Enregistrer" }).click();
    await expect(form.getByRole("status").filter({ hasText: "Enregistré" })).toBeVisible();

    const [after] = await sql<{ accent_color: string; settings: { accent2?: string } }>("select accent_color, settings from restaurants where slug = 'restaurant-demo'");
    expect(after!.accent_color).toBe("#8E1B3A");
    expect(after!.settings.accent2).toBe("#E9B530");

    await openMenu(page);
    await expect(page.getByTestId("brand-band")).toHaveAttribute("style", /--accent-2/);
    const vars = await page.locator("[data-menu-theme]").evaluate((el) => [getComputedStyle(el).getPropertyValue("--accent").trim(), getComputedStyle(el).getPropertyValue("--accent-2").trim()]);
    expect(vars).toEqual(["#8E1B3A", "#E9B530"]);
    const badge = page.getByTestId("new-badge").first();
    await expect(badge).toHaveCSS("background-color", "rgb(233, 181, 48)");
  } finally {
    await sql("update restaurants set accent_color = $1, theme = $2, settings = $3::jsonb where slug = 'restaurant-demo'", [before!.accent_color, before!.theme, JSON.stringify(before!.settings)]);
  }
});
