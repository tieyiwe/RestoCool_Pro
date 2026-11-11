import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("a new person scans the team QR, the owner is prompted, accepts, and the person gets their matricule", async ({ page, browser }, info) => {
  const tag = info.project.name.replace(/\W/g, "");
  const name = `Mariam Sawadogo ${tag}`;
  // Owner shows « Inviter mon équipe ».
  await page.goto("/app/staff");
  await page.getByTestId("invite-link").click();
  const url = await page.getByTestId("invite-qr").getAttribute("data-url");
  expect(url).toMatch(/\/rejoindre\/[A-Za-z0-9_-]{16,}$/);

  // The person's own phone (separate browser, never signed in).
  const phone = await browser.newContext({ ...info.project.use, baseURL: info.project.use.baseURL });
  const p = await phone.newPage();
  await p.goto(new URL(url!).pathname);
  await expect(p.getByTestId("join-page")).toContainText("Restaurant Démo");
  const form = p.getByTestId("join-form");
  await form.locator("input[name=name]").fill(name);
  await form.locator("input[name=phone]").fill(tag.includes("phone") ? "70 55 44 01" : "70 55 44 02");
  await form.locator("input[name=pin]").fill("2580");
  await form.locator("input[name=pin2]").fill("2581");
  await form.getByTestId("join-submit").click();
  await expect(p.getByTestId("join-error")).toContainText("pas identiques");
  // Name and phone are kept; the PINs are typed again.
  await expect(form.locator("input[name=name]")).toHaveValue(name);
  await form.locator("input[name=pin]").fill("2580");
  await form.locator("input[name=pin2]").fill("2580");
  await form.getByTestId("join-submit").click();
  await expect(p.getByTestId("join-status")).toHaveAttribute("data-status", "pending");

  // The owner is prompted on any screen.
  await page.goto("/app");
  await expect(page.getByTestId("join-prompt")).toContainText("demande à rejoindre l'équipe");
  await page.getByTestId("join-prompt-open").click();
  const req = page.getByTestId("join-request").filter({ hasText: name });
  await req.getByTestId("join-role").selectOption({ label: "Serveur·se" });
  await req.getByTestId("join-accept").click();
  await expect(page.getByTestId("staff-ok")).toContainText("matricule");
  const row = page.getByTestId("personnel-row").filter({ hasText: name });
  await expect(row.getByTestId("person-role")).toHaveText("Serveur·se");
  const no = await row.getAttribute("data-staff-no");

  // The person's phone updates by itself with the matricule.
  await expect(p.getByTestId("join-status")).toHaveAttribute("data-status", "accepted", { timeout: 15_000 });
  await expect(p.getByTestId("join-staff-no")).toHaveText(String(no).padStart(3, "0"));
  await phone.close();
});

test("an old or made-up team QR says to ask for the new one", async ({ page }) => {
  await page.goto("/rejoindre/AAAAAAAAAAAAAAAAAAAAAAAA");
  await expect(page.getByTestId("join-invalid")).toBeVisible();
});
