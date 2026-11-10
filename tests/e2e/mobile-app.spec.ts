import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import QRCode from "qrcode";

/**
 * A fake camera that films a RestoCool QR code (table menu link on another host), so the real
 * scanner path runs: camera → decoder → open the page on this site.
 */
const dir = path.join(process.cwd(), "test-results", "fake-camera");
const video = path.join(dir, "qr.y4m");
function makeQrVideo() {
  mkdirSync(dir, { recursive: true });
  const qr = QRCode.create("https://restocool.com/r/restaurant-demo", { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const W = 640;
  const H = 480;
  const scale = Math.floor(360 / (n + 8));
  const off = [Math.floor((W - n * scale) / 2), Math.floor((H - n * scale) / 2)];
  const px = Buffer.alloc(W * H, 255);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      if (qr.modules.get(y, x))
        for (let dy = 0; dy < scale; dy++) px.fill(0, (off[1]! + y * scale + dy) * W + off[0]! + x * scale, (off[1]! + y * scale + dy) * W + off[0]! + (x + 1) * scale);
  const pgm = path.join(dir, "qr.pgm");
  writeFileSync(pgm, Buffer.concat([Buffer.from(`P5\n${W} ${H}\n255\n`), px]));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-i", pgm, "-t", "2", "-r", "10", "-pix_fmt", "yuv420p", video]);
}
makeQrVideo();

test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${video}`] },
  permissions: ["camera"],
});

test("phones get native-style tabs; « Plus » holds the rest and the back button closes it", async ({ page }) => {
  await page.goto("/app");
  const tabs = page.getByTestId("bottom-tabs");
  if (!(await tabs.isVisible())) {
    // Tablet and desktop: the side menu, no bottom bar.
    await expect(page.locator('nav a[href="/app/scan"]').first()).toBeVisible();
    return;
  }
  await expect(tabs.getByRole("link", { name: "Accueil" })).toHaveAttribute("aria-current", "page");
  await expect(tabs.getByRole("link", { name: "Scanner" })).toBeVisible();
  await page.getByTestId("more-tab").click();
  const sheet = page.getByTestId("more-sheet");
  await expect(sheet.getByRole("link", { name: "Personnel" })).toBeVisible();
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/app$/);
  await page.getByTestId("more-tab").click();
  await sheet.getByRole("link", { name: "Paramètres" }).click();
  await expect(page).toHaveURL(/\/app\/settings/);
  await expect(sheet).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("the scanner reads a QR code from the camera and opens it on this site", async ({ page }) => {
  await page.goto("/app/scan");
  await expect(page).toHaveURL(/\/r\/restaurant-demo$/, { timeout: 20_000 });
});
