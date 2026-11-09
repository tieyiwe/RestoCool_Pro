import { expect, test } from "@playwright/test";

/** Safari (iPhone) cannot encode WebP: the browser falls back to JPEG, which the server must accept. */
test("a JPEG photo (iPhone fallback) uploads and is served as image/jpeg", async ({ page }) => {
  await page.goto("/app");
  const jpeg = async (w: number, h: number) =>
    Buffer.from(
      await page.evaluate(
        ([width, height]) => {
          const c = document.createElement("canvas");
          c.width = width!;
          c.height = height!;
          const g = c.getContext("2d")!;
          g.fillStyle = "#0F6B3E";
          g.fillRect(0, 0, width!, height!);
          return c.toDataURL("image/jpeg", 0.8).split(",")[1]!;
        },
        [w, h],
      ),
      "base64",
    );
  const res = await page.request.post("/api/app/media", {
    multipart: {
      kind: "item",
      width: "320",
      height: "240",
      full: { name: "full.jpg", mimeType: "image/jpeg", buffer: await jpeg(320, 240) },
      thumb: { name: "thumb.jpg", mimeType: "image/jpeg", buffer: await jpeg(168, 168) },
    },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { fullUrl: string; thumbUrl: string };
  expect(body.fullUrl).toMatch(/\.jpg$/);
  const img = await page.request.get(body.thumbUrl);
  expect(img.headers()["content-type"]).toBe("image/jpeg");
  expect(img.headers()["x-content-type-options"]).toBe("nosniff");
});
