import { expect, test } from "@playwright/test";
import { openMenu, sql } from "./helpers";

test("the slogan is typed once, in the owner's language, and shows on the public page", async ({ page }) => {
  const [before] = await sql<{ description: unknown }>("select description from restaurants where slug = 'restaurant-demo'");
  try {
    await page.goto("/app/settings#profile");
    await page.waitForLoadState("networkidle");
    const form = page.getByTestId("profile-form");
    // One box only (no FR / EN / 中文 copies).
    await expect(form.getByTestId("description-input")).toHaveCount(1);
    await expect(form.locator('input[name^="description_"]:not([type=hidden])')).toHaveCount(0);
    await form.getByTestId("description-input").fill("Grillades et jus locaux, terrasse ombragée.");
    await form.getByRole("button", { name: "Enregistrer" }).click();
    await expect(form.getByRole("status").filter({ hasText: "Enregistré" })).toBeVisible();
    const [after] = await sql<{ description: { fr: string; en?: string } }>("select description from restaurants where slug = 'restaurant-demo'");
    expect(after!.description).toEqual({ fr: "Grillades et jus locaux, terrasse ombragée." });
    await openMenu(page);
    await expect(page.getByText("Grillades et jus locaux, terrasse ombragée.")).toBeVisible();
  } finally {
    await sql("update restaurants set description = $1::jsonb where slug = 'restaurant-demo'", [JSON.stringify(before!.description)]);
  }
});
