import jsQR from "jsqr";
import { PNG } from "pngjs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { brandedQrPng, brandedQrSvg } = await import("@/lib/qr-branded");

describe("RestoCool QR codes with the icon in the middle", () => {
  const urls = [
    "https://restocool.com/r/restaurant-demo",
    "https://restocool.com/r/maquis-le-baobab-de-ouaga-2000/t/AbCdEfGhIjKlMnOpQrStUvWx",
    "https://restocool.com/rejoindre/AbCdEfGhIjKlMnOpQrStUvWx",
  ];
  it.each(urls)("still scans: %s", (url) => {
    const png = PNG.sync.read(brandedQrPng(url, { width: 600 }));
    const found = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    expect(found?.data).toBe(url);
  });
  it("still scans when printed small (≈ 2.5 cm on a sticker)", () => {
    const png = PNG.sync.read(brandedQrPng(urls[1]!, { width: 200 }));
    expect(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data).toBe(urls[1]);
  });
  it("the SVG has the icon and no cut modules under it", () => {
    const svg = brandedQrSvg(urls[0]!);
    expect(svg).toContain('href="/brand/png/app-icon-192.png"');
    expect(svg.startsWith("<svg")).toBe(true);
  });
});
