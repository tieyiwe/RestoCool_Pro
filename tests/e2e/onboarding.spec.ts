import { expect, test } from "@playwright/test";
import { freeDevOwnerSlots, pngBuffer, sql } from "./helpers";

test.describe.configure({ mode: "serial" });

test("owner creates a restaurant, goes through the wizard, builds a menu with a photo and publishes it", async ({ page }, info) => {
  await freeDevOwnerSlots();
  // Long end-to-end path; on a cold `next dev` the first visit to each route compiles it,
  // which pushed this test past the default 30 s on the first project.
  test.setTimeout(180_000);
  const name = `Maquis E2E ${info.project.name}`;

  // 1. Create
  await page.goto("/app/new");
  await page.getByLabel("Nom de l'établissement").fill("x");
  await page.getByRole("button", { name: "Créer mon établissement" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "au moins 2 caractères" })).toBeVisible();
  // A name another business already uses is refused, with close names that are free.
  await page.getByLabel("Nom de l'établissement").fill("restaurant démo");
  await expect(page.getByTestId("name-status")).toHaveAttribute("data-state", "taken");
  await expect(page.getByTestId("name-status")).toContainText("déjà utilisé");
  const suggestion = page.getByTestId("name-suggestion");
  expect(await suggestion.count()).toBeGreaterThanOrEqual(1);
  expect(await suggestion.count()).toBeLessThanOrEqual(3);
  await expect(page.getByRole("button", { name: /Créer mon établissement/ })).toBeDisabled();
  const proposed = (await suggestion.first().textContent())!;
  expect(proposed).toMatch(/Démo/i);
  await suggestion.first().click();
  await expect(page.getByLabel("Nom de l'établissement")).toHaveValue(proposed);
  await expect(page.getByTestId("name-status")).toContainText("✓ Nom disponible");
  await page.getByLabel("Nom de l'établissement").fill(name);
  await expect(page.getByTestId("name-status")).toContainText("✓ Nom disponible");
  await expect(page.getByTestId("slug-preview")).toContainText("restocool.com/r/maquis-e2e-");
  // City: Burkina's towns in a list, or « Autre ville… » to type one that isn't there.
  await expect(page.getByTestId("city-select")).toHaveValue("Ouagadougou");
  await page.getByTestId("city-select").selectOption("Koudougou");
  await page.getByTestId("city-select").selectOption({ label: "Autre ville…" });
  await page.getByTestId("city-select-other").fill("Kokologho");
  await page.getByRole("button", { name: "Créer mon établissement" }).click();

  // 2. Wizard: profile → contacts → hours → service → appearance → done
  await expect(page).toHaveURL(/\/app\/onboarding\/1$/);
  // The typed town is kept (shown as « Autre ville » + the name).
  await expect(page.getByTestId("city-select-other")).toHaveValue("Kokologho");
  // Business first: other sections stay locked (no navigation, pages lead back to the setup).
  await expect(page.getByRole("link", { name: "Personnel" })).toHaveCount(0);
  await page.goto("/app/staff");
  await expect(page).toHaveURL(/\/app\/onboarding\/1$/);
  await page.goto("/app/menu");
  await expect(page).toHaveURL(/\/app\/onboarding\/1$/);
  await expect(page.getByText("Étape 2 sur 6")).toBeVisible();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page).toHaveURL(/\/onboarding\/2$/);
  await page.getByTestId("whatsapp-input").fill("70 12 34 56");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page).toHaveURL(/\/onboarding\/3$/);
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page).toHaveURL(/\/onboarding\/4$/);
  // A new restaurant has no tables yet: the wizard asks how many and creates them with their QR.
  await page.getByTestId("table-count").fill("6");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page).toHaveURL(/\/onboarding\/5$/);
  await expect(page.getByTestId("branding-preview")).toContainText(name);
  await page.getByRole("button", { name: "Terminer la configuration" }).click();
  await expect(page.getByRole("heading", { name: /Votre établissement est prêt/ })).toBeVisible();
  // The main QR code is ready at once, with print-and-place instructions.
  const mainQr = page.getByTestId("main-qr");
  await expect(mainQr.locator("svg")).toBeVisible();
  await expect(mainQr).toContainText("Placez-le partout");
  await expect(page.getByTestId("main-qr-url")).toHaveText(/\/r\/maquis-e2e-/);
  // The visual « Personnalisez votre page » guide: what is set and what to do next.
  const guide = page.getByTestId("customize-guide");
  await expect(guide).toContainText("Personnalisez votre page");
  await expect(guide.getByTestId("customize-contacts")).toHaveAttribute("data-done", "true"); // WhatsApp typed in step 2
  await expect(guide.getByTestId("customize-logo")).toHaveAttribute("data-done", "false");
  await expect(guide.getByTestId("customize-logo")).toHaveAttribute("href", "/app/settings#appearance");
  await expect(guide.getByTestId("customize-name")).toHaveAttribute("href", "/app/settings#profile");
  const mainCode = (await page.getByTestId("main-qr-code").textContent())!.trim();
  expect(mainCode).toMatch(/^RC-[A-Z2-9]{5}$/);
  await page.getByTestId("done-dishes").click();
  await expect(page).toHaveURL(/\/app\/menu$/);

  // 3. Menu: a category, then a dish with « Suggérer », variants and a photo
  await expect(page.getByText("Votre menu est vide")).toBeVisible();
  await page.getByLabel("Nom de la catégorie").fill("Grillades");
  await page.getByRole("button", { name: "Ajouter une catégorie" }).click();
  await page.getByRole("link", { name: "+ Ajouter un plat" }).click();
  await page.getByTestId("name-fr").fill("Riz gras");
  await page.getByRole("button", { name: "✨ Suggérer" }).first().click();
  await expect(page.getByTestId("name-en")).toHaveValue("Jollof-style rice");
  await expect(page.getByTestId("name-zh")).toHaveValue("油焖饭");
  await page.getByRole("button", { name: "+ Ajouter une variante" }).click();
  await page.getByRole("button", { name: "+ Ajouter une variante" }).click();
  await page.getByLabel("Nom de la variante FR").nth(0).fill("Demi");
  await page.getByLabel("Prix", { exact: true }).nth(0).fill("1 500");
  await page.getByLabel("Nom de la variante FR").nth(1).fill("Complet");
  await page.getByLabel("Prix", { exact: true }).nth(1).fill("2500");
  await page.getByLabel("Ajouter une photo").setInputFiles({ name: "riz.png", mimeType: "image/png", buffer: await pngBuffer(page) });
  await expect(page.getByTestId("photo-preview")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Photo compressée/)).toBeVisible();
  await expect(page.getByRole("radio", { name: "Pas pimenté" })).toBeChecked();
  await page.getByRole("radio", { name: /^Pimenté/ }).check();
  await page.getByRole("button", { name: "Enregistrer le plat" }).click();
  await expect(page).toHaveURL(/\/app\/menu$/, { timeout: 20_000 });
  const row = page.getByTestId("admin-item").filter({ hasText: "Riz gras" });
  await expect(row).toContainText("1\u202F500\u202FF / 2\u202F500\u202FF");
  // Editing loads the saved values back (spice level included).
  await row.getByRole("link", { name: "Modifier" }).click();
  await expect(page.getByRole("radio", { name: /^Pimenté/ })).toBeChecked();
  await expect(page.getByTestId("name-zh")).toHaveValue("油焖饭");
  await page.goto("/app/menu");

  // Tables 1..6 exist; the main QR sticker sheet carries the 2 scan steps.
  await page.goto("/app/seating");
  await expect(page.getByTestId("seats-table").getByTestId("seat-row")).toHaveCount(6);
  await page.goto("/app/seating/print?qr=main&layout=grid");
  await expect(page.getByTestId("print-card")).toHaveCount(6);
  await expect(page.getByTestId("scan-steps").first()).toContainText("Ouvrez l’appareil photo");
  await expect(page.getByTestId("scan-steps").first()).toContainText("touchez le lien");
  await expect(page.getByTestId("card-rc").first()).toContainText(mainCode);
  await expect(page.getByTestId("card-scan-me").first()).toContainText("Scannez-moi");

  // 4. Publish from Settings, then the public menu shows the dish and its photo
  await page.goto("/app/settings#publish");
  await page.getByTestId("publish-section").getByRole("button", { name: "Publier mon menu" }).click();
  await expect(page.getByTestId("publish-status")).toContainText("Votre menu est en ligne", { timeout: 10_000 });
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
  await page.goto(`/r/${slug}`);
  await page.getByTestId("welcome").click();
  await expect(page.getByTestId("dish-name")).toHaveText("Riz gras");
  const thumb = page.getByTestId("menu-item").locator("img").first();
  await expect(thumb).toHaveAttribute("src", /\/api\/media\/r\/.+-t\.webp$/);
  const img = await page.request.get((await thumb.getAttribute("src"))!);
  expect(img.headers()["content-type"]).toBe("image/webp");

  // 5. Start using it, for free: the welcome email went out (recorded once), the dashboard shows
  // the launch offer, a customer orders at table 1 and the owner serves it live.
  const [biz] = await sql<{ id: string }>("select id from restaurants where slug = $1", [slug]);
  await expect
    .poll(async () => (await sql<{ to: string; status: string }>("select \"to\", status from email_log where restaurant_id = $1 and kind = 'welcome'", [biz!.id]))[0])
    .toMatchObject({ to: "dev@localhost", status: "skipped" }); // no SMTP password in tests: written to .data/outbox
  await page.goto("/app");
  await expect(page.getByTestId("free-launch")).toContainText("Offert pendant le lancement");
  // The guide stays on the dashboard until the page is fully personalised.
  await expect(page.getByTestId("customize-guide")).toBeVisible();
  // Even past the 30 days, nothing locks while the launch offer is on.
  await sql("update restaurants set plan_expires_at = now() - interval '1 day' where id = $1", [biz!.id]);
  await page.reload();
  await expect(page.getByTestId("free-launch")).toBeVisible();
  const [t1] = await sql<{ qr_token: string }>("select qr_token from seats where restaurant_id = $1 and type = 'table' and label = '1'", [biz!.id]);
  const phoneCtx = await page.context().browser()!.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phoneCtx.addInitScript((sl) => sessionStorage.setItem(`rc-welcome-${sl}`, "1"), slug);
  const phone = await phoneCtx.newPage();
  await phone.goto(`/r/${slug}/t/${t1!.qr_token}`);
  await expect(phone.getByTestId("seat-badge")).toContainText("Table 1", { timeout: 25_000 });
  await phone.getByTestId("add-button").click();
  await phone.getByTestId("variant-sheet").getByText("Complet").click();
  await phone.getByTestId("variant-confirm").click();
  await phone.getByTestId("cart-bar").click();
  await phone.getByTestId("send-order").click();
  await expect(phone.getByTestId("my-order").first()).toHaveAttribute("data-status", /sent|confirmed/);
  await page.goto("/app/service");
  const card = page.getByTestId("order-card").filter({ hasText: "Riz gras" });
  await expect(card).toContainText("2\u202F500\u202FF", { timeout: 30_000 }); // first visit compiles the board
  for (let i = 0; i < 4 && (await card.getAttribute("data-status")) !== "served"; i++) {
    const before = (await card.getAttribute("data-status"))!;
    await card.locator("[data-testid=action-confirmed], [data-testid=action-ready], [data-testid=action-served]").first().click();
    await expect(card).not.toHaveAttribute("data-status", before);
  }
  await expect(phone.getByTestId("served")).toContainText("Vous avez été servi", { timeout: 15_000 });
  await phoneCtx.close();

  // 6. Switch back to the demo restaurant with the header selector.
  await page.goto("/app");
  await page.getByLabel("Changer d'établissement").locator("visible=true").selectOption({ label: "Restaurant Démo" });
  await page.getByRole("button", { name: "Valider" }).click();
  await expect(page.getByTestId("restaurant-name")).toHaveText("Restaurant Démo");
});
