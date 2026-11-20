import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type Item = { name: string; p?: number; d?: string; variants?: Array<{ name: string; p: number }> };
const data = JSON.parse(readFileSync(path.join(process.cwd(), "imports", "la-terrace", "data.json"), "utf8")) as {
  CATEGORIES: Array<{ fr: string; en: string; station: string; items: Item[] }>;
};

describe("La Terrace menu data", () => {
  it("has every category named in FR and EN with a known station", () => {
    expect(data.CATEGORIES.length).toBe(24);
    for (const c of data.CATEGORIES) {
      expect(c.fr.trim()).not.toBe("");
      expect(c.en.trim()).not.toBe("");
      expect(["kitchen", "grill", "drinks", "desserts"]).toContain(c.station);
    }
  });

  it("gives every item a whole FCFA price above 0 (or variants that all have one)", () => {
    const items = data.CATEGORIES.flatMap((c) => c.items);
    expect(items.length).toBe(250);
    for (const it of items) {
      const prices = it.variants?.length ? it.variants.map((v) => v.p) : [it.p];
      for (const p of prices) {
        expect(Number.isInteger(p), it.name).toBe(true);
        expect(p!, it.name).toBeGreaterThan(0);
      }
    }
  });
});
