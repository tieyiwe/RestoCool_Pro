import { expect, test } from "@playwright/test";
import { seatToken, sql } from "./helpers";

/** The demo restaurant's main code (made on first use, like the app does). */
async function demoCode(seatLabel?: string): Promise<string> {
  const [r] = await sql<{ id: string }>("select id from restaurants where slug = 'restaurant-demo'");
  const seat = seatLabel ? (await sql<{ id: string }>("select id from seats where restaurant_id = $1 and type = 'table' and label = $2", [r!.id, seatLabel]))[0]!.id : null;
  const find = () => sql<{ code: string }>(`select code from access_codes where restaurant_id = $1 and seat_id ${seat ? "= $2" : "is null"}`, seat ? [r!.id, seat] : [r!.id]);
  let [row] = await find();
  if (!row) {
    await sql("insert into access_codes (code, restaurant_id, seat_id) values ($1, $2, $3) on conflict do nothing", [seat ? "TBW7K" : "DMZ4Q", r!.id, seat]);
    [row] = await find();
  }
  return row!.code;
}

test("a customer types the code from restocool.com and lands on the menu", async ({ page }) => {
  const code = await demoCode();
  await page.goto("/");
  const box = page.getByTestId("home-code");
  await box.getByLabel("Numéro RC de l'établissement").fill(`rc-${code.toLowerCase()}`);
  await box.getByRole("button", { name: "Ouvrir le menu" }).click();
  await expect(page).toHaveURL(/\/r\/restaurant-demo$/);
});

test("a table code opens that table, like its QR", async ({ page }) => {
  const code = await demoCode("3");
  await page.goto(`/c/${code}`);
  await expect(page).toHaveURL(new RegExp(`/r/restaurant-demo/t/${await seatToken("3")}$`));
});

test("wrong codes say what to do", async ({ page }) => {
  await page.goto("/c");
  await page.getByLabel("Numéro RC de l'établissement").fill("AB");
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await expect(page.getByTestId("code-error")).toContainText("5 lettres ou chiffres");
  await page.getByLabel("Numéro RC de l'établissement").fill("ZZZZZ");
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await expect(page.getByTestId("code-error")).toContainText("Aucun établissement ne correspond");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
