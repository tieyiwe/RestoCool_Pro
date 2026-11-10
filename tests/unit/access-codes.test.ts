import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { CODE_ALPHABET, generateCode, normalizeCode } = await import("@/lib/access-codes");

describe("access codes", () => {
  it("are 5 characters from an alphabet without look-alikes", () => {
    for (const ch of "0O1ILUV") expect(CODE_ALPHABET).not.toContain(ch);
    for (let i = 0; i < 500; i++) expect(generateCode()).toMatch(new RegExp(`^[${CODE_ALPHABET}]{5}$`));
  });
  it("accept what people type: lower case, spaces, dashes", () => {
    expect(normalizeCode(" k7m-3p ")).toBe("K7M3P");
    expect(normalizeCode("K7 M3P")).toBe("K7M3P");
  });
  it("reject anything else", () => {
    for (const bad of ["", "K7M3", "K7M3PQ", "K0M3P", "K7M3!", "<script>"]) expect(normalizeCode(bad)).toBeNull();
  });
});
