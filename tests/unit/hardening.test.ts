import { describe, expect, it } from "vitest";
import { detectImageFormat } from "@/lib/image/webp";
import { isLocalHost } from "@/lib/env";

describe("upload format detection (from bytes, not from the declared type)", () => {
  it("recognises WebP and JPEG (iPhone fallback), rejects the rest", () => {
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0]);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const svg = new TextEncoder().encode("<svg onload=alert(1)>");
    expect(detectImageFormat(webp)).toBe("webp");
    expect(detectImageFormat(jpeg)).toBe("jpg");
    expect(detectImageFormat(png)).toBeNull();
    expect(detectImageFormat(svg)).toBeNull();
  });
});

describe("dev sign-in bypass is limited to this machine", () => {
  it("accepts only localhost addresses", () => {
    for (const h of ["localhost", "localhost:5000", "127.0.0.1:5100", "[::1]:3000"]) expect(isLocalHost(h)).toBe(true);
    for (const h of ["abc.replit.dev", "restocool.com", "localhost.evil.com", "", null]) expect(isLocalHost(h)).toBe(false);
  });
});
