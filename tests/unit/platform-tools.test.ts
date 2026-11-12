import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { hasPerm, normalizePerms, PERM_PRESETS } from "@/lib/admin/access";
import { deviceFromUa } from "@/lib/usage/device";

describe("admin permissions", () => {
  it("adds what a permission needs and drops unknown ones", () => {
    expect(normalizePerms(["billing.write", "hack"])).toEqual(["businesses.read", "billing.read", "billing.write"]);
    expect(normalizePerms(["recovery"])).toEqual(["businesses.read", "support", "recovery"]);
  });
  it("owners have everything; collaborators only theirs", () => {
    expect(hasPerm({ owner: true, perms: new Set() }, "team")).toBe(true);
    expect(hasPerm({ owner: false, perms: new Set(normalizePerms(PERM_PRESETS.support!)) }, "billing.write")).toBe(false);
    expect(hasPerm({ owner: false, perms: new Set(normalizePerms(PERM_PRESETS.support!)) }, "recovery")).toBe(true);
  });
  it("no preset hands out team or settings", () => {
    for (const p of Object.values(PERM_PRESETS)) expect(p.some((x) => x === "team" || x === "settings")).toBe(false);
  });
});

describe("device type from the browser", () => {
  it.each([
    ["Mozilla/5.0 (Linux; Android 13; TECNO KI5k) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36", "phone", "android"],
    ["Mozilla/5.0 (Linux; Android 12; SM-T225) AppleWebKit/537.36 Chrome/120 Safari/537.36", "tablet", "android"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1", "phone", "ios"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36", "desktop", "windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", "desktop", "mac"],
  ])("%s", (ua, device, os) => {
    expect(deviceFromUa(ua)).toEqual({ device, os });
  });
  it("an iPad that says « Macintosh » is a tablet", () => {
    expect(deviceFromUa("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", { touch: true })).toEqual({ device: "tablet", os: "ios" });
  });
});
