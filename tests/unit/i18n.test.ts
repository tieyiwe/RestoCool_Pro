import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import zh from "@/messages/zh.json";

function keys(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

describe("messages", () => {
  it("EN and ZH have exactly the same keys as FR", () => {
    const base = keys(fr).sort();
    expect(keys(en).sort()).toEqual(base);
    expect(keys(zh).sort()).toEqual(base);
  });
});
