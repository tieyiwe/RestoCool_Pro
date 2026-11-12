import { expect, test } from "@playwright/test";

test("a tablet is authorised, Awa logs in with her PIN, works with her access only, locks; revoking stops the tablet", async ({ browser }, info) => {
  test.setTimeout(120_000);
  const tag = info.project.name.replace(/\W/g, "");
  const ctx = await browser.newContext({ ...info.project.use });
  const page = await ctx.newPage();

  // Owner authorises this browser as « Tablette salle ».
  await page.goto("/app/staff");
  await page.getByTestId("devices-link").click();
  const form = page.getByTestId("authorize-device");
  await form.locator("input[name=name]").fill(`Tablette salle ${tag}`);
  await form.getByRole("button", { name: "Autoriser cet appareil" }).click();
  await expect(page.getByTestId("this-device")).toContainText(`Tablette salle ${tag}`);
  await page.getByTestId("switch-to-post").click();

  // The PIN pad: the team, never the owner.
  await expect(page).toHaveURL(/\/poste$/);
  const team = page.getByTestId("poste-team");
  await expect(team).toContainText("Awa (serveuse)");
  await expect(team).not.toContainText("Propriétaire Démo");
  await team.getByTestId("poste-person").filter({ hasText: "Awa (serveuse)" }).click();
  await expect(page.getByTestId("pin-form")).toBeVisible();
  await page.waitForLoadState("networkidle");
  for (const d of "9999") await page.getByTestId(`pin-key-${d}`).click();
  await expect(page.getByTestId("pin-dots")).toHaveAttribute("aria-label", "4 chiffres tapés");
  await page.getByTestId("pin-submit").click();
  await expect(page.getByTestId("pin-error")).toContainText("Code PIN incorrect");
  for (const d of "1234") await page.getByTestId(`pin-key-${d}`).click();
  await page.getByTestId("pin-submit").click();

  // She lands on the service screen, as herself, with a server's access only.
  await expect(page).toHaveURL(/\/app\/service$/);
  await expect(page.getByTestId("pin-session")).toBeVisible();
  const res = await page.goto("/app/staff");
  expect(res?.status()).toBe(404);
  expect((await page.request.get("/api/app/orders")).status()).toBe(200);
  expect((await page.request.get("/api/app/orders/export?range=today")).status()).toBe(403);

  // « Verrouiller »: back to the pad; the app no longer opens as her.
  await page.goto("/app/service");
  await page.getByTestId("pin-lock").click();
  await expect(page).toHaveURL(/\/poste\?locked=1$/);
  await expect(page.getByTestId("poste-locked")).toBeVisible();

  // The owner (on their own device) revokes the tablet: it stops at once.
  const owner = await browser.newPage();
  await owner.goto("/app/staff/devices");
  owner.once("dialog", (d) => void d.accept());
  await owner.getByTestId("device-row").filter({ hasText: `Tablette salle ${tag}` }).getByTestId("device-revoke").click();
  await expect(owner.getByTestId("devices-ok")).toContainText("révoqué");
  await page.goto("/poste");
  await expect(page.getByTestId("poste-unauthorized")).toBeVisible();
  await owner.close();
  await ctx.close();
});

test("an unknown browser opening /poste is told how to authorise it", async ({ page }) => {
  await page.goto("/poste");
  await expect(page.getByTestId("poste-unauthorized")).toContainText("Cet appareil n'est pas autorisé");
});
