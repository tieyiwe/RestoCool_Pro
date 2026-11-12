import { expect, test } from "@playwright/test";
import { sql } from "./helpers";

test("an employee who left is archived (access closed, history kept), can be brought back, or their personal data erased", async ({ page }, info) => {
  const name = `Départ ${info.project.name}`;
  await sql("delete from members where name like $1", [`${name}%`]);
  await sql("delete from members where name like 'Ancien employé%' and restaurant_id = (select id from restaurants where slug = 'restaurant-demo') and staff_no >= 950");
  const [m] = await sql<{ id: string }>(
    "insert into members (restaurant_id, name, role, staff_no, active, phone) select id, $1, 'server', 950 + (select count(*) from members x where x.restaurant_id = r.id and x.staff_no >= 950), true, '+22670000099' from restaurants r where slug = 'restaurant-demo' returning id",
    [name],
  );
  page.on("dialog", (d) => d.accept());
  await page.goto("/app/staff");
  const row = page.getByTestId("personnel-row").filter({ hasText: name });
  await row.getByTestId("archive-open").click();
  await row.getByTestId("archive-person").click();
  await page.waitForURL(/ok=archived/);
  await expect(page.getByTestId("personnel-row").filter({ hasText: name })).toHaveCount(0);
  const former = page.getByTestId("former-staff");
  await former.locator("summary").click();
  await expect(former.getByTestId("former-row").filter({ hasText: name })).toBeVisible();
  const [a] = await sql<{ active: boolean; archived_at: Date | null }>("select active, archived_at from members where id = $1", [m!.id]);
  expect(a).toMatchObject({ active: false });
  expect(a!.archived_at).not.toBeNull();

  // Brought back…
  await former.getByTestId("former-row").filter({ hasText: name }).getByTestId("restore-person").click();
  await page.waitForURL(/ok=restored/);
  await expect(page.getByTestId("personnel-row").filter({ hasText: name })).toBeVisible();
  // …archived again, then personal data erased (matricule kept).
  await page.getByTestId("personnel-row").filter({ hasText: name }).getByTestId("archive-open").click();
  await page.getByTestId("personnel-row").filter({ hasText: name }).getByTestId("archive-person").click();
  await page.waitForURL(/ok=archived/);
  await page.getByTestId("former-staff").locator("summary").click();
  await page.getByTestId("former-row").filter({ hasText: name }).getByTestId("erase-person").click();
  await page.waitForURL(/ok=erased/);
  await expect(page.getByTestId("former-staff")).not.toContainText(name);
  const [e] = await sql<{ name: string; phone: string | null; erased_at: Date | null }>("select name, phone, erased_at from members where id = $1", [m!.id]);
  expect(e!.name).toMatch(/^Ancien employé \d{3}$/);
  expect(e!.phone).toBeNull();
  expect(e!.erased_at).not.toBeNull();
});
