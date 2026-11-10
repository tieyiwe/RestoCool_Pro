import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { allow } = await import("@/lib/public-api");

const req = (ip: string) => new Request("http://localhost/api/public/x", { headers: { "x-forwarded-for": ip } });

describe("public rate limit", () => {
  it("a new device id per request does not escape the limit of one IP", () => {
    let passed = 0;
    for (let i = 0; i < 2000; i++) if (allow(req("10.1.2.3"), `device${String(i).padStart(16, "0")}`)) passed++;
    expect(passed).toBeLessThan(2000);
    expect(passed).toBeGreaterThanOrEqual(600);
    // Another IP (another restaurant's Wi-Fi) is not affected.
    expect(allow(req("10.1.2.4"), "deviceAAAAAAAAAAAAAAAA")).toBe(true);
  });

  it("still limits one device on its own", () => {
    let passed = 0;
    for (let i = 0; i < 100; i++) if (allow(req("10.5.5.5"), "deviceBBBBBBBBBBBBBBBB")) passed++;
    expect(passed).toBeLessThanOrEqual(31);
  });
});

describe("client IP for rate limits", () => {
  it("ignores addresses the client put first in X-Forwarded-For", async () => {
    const { ipFromHeaders } = await import("@/lib/rate-limit");
    const h = new Headers({ "x-forwarded-for": "6.6.6.6, 1.2.3.4" });
    expect(ipFromHeaders(h)).toBe("1.2.3.4"); // added by the trusted proxy (1 hop)
    expect(ipFromHeaders(new Headers({ "x-forwarded-for": "1.2.3.4" }))).toBe("1.2.3.4");
    expect(ipFromHeaders(new Headers())).toBe("unknown");
  });
});
