import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import jsQR from "jsqr";
import { PNG } from "pngjs";

test("the downloaded QR sticker has « Scannez-moi », the QR (still scannable) and the numéro RC", async ({ page }, info) => {
  await page.goto("/app");
  const card = page.getByTestId("main-qr");
  await expect(card.getByTestId("main-qr-sticker")).toContainText("Scannez-moi");
  const rc = (await card.getByTestId("main-qr-code").textContent())!.trim();
  await expect(card.getByTestId("main-qr-sticker")).toContainText(rc);

  const [download] = await Promise.all([page.waitForEvent("download"), card.getByTestId("sticker-download").click()]);
  expect(download.suggestedFilename()).toBe("restaurant-demo-qr-rc.png");
  const file = info.outputPath("sticker.png");
  await download.saveAs(file);
  if (process.env.STICKER_SAMPLE) await download.saveAs(process.env.STICKER_SAMPLE);
  const png = PNG.sync.read(readFileSync(file));
  expect([png.width, png.height]).toEqual([1200, 1770]);
  const found = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  expect(found?.data).toMatch(/\/r\/restaurant-demo$/);
});
