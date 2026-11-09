import { describe, expect, it } from "vitest";
import { accentIsReadable, contrastRatio } from "@/lib/color";
import { suggestTranslation } from "@/lib/menu/glossary";
import { addToCart, cartTotals, changeQty, indexItems, takeawayMessage, unitPrice } from "@/lib/public-menu/cart";
import { openStatus } from "@/lib/public-menu/hours";
import { itemMatches } from "@/lib/public-menu/search";
import { format } from "@/lib/public-menu/translate";
import type { PublicItem, PublicMenuData } from "@/lib/public-menu/types";

const N = " ";
const item = (over: Partial<PublicItem>): PublicItem => ({
  id: "i1",
  code: "10",
  name: { fr: "Poulet bicyclette", en: "Free-range chicken", zh: "走地鸡" },
  description: null,
  price: 2000,
  variants: [],
  options: [],
  spicy: 0,
  tags: [],
  thumbUrl: null,
  photoUrl: null,
  soldOut: false,
  ...over,
});

describe("Suggérer (glossary)", () => {
  it("translates known phrases", () => {
    expect(suggestTranslation("Riz gras")).toEqual({ en: "Jollof-style rice", zh: "油焖饭" });
    expect(suggestTranslation("jus de bissap")).toEqual({ en: "Hibiscus juice", zh: "洛神花汁" });
  });
  it("combines words and drops French connectors", () => {
    const s = suggestTranslation("Brochettes de bœuf");
    expect(s.en).toBe("Skewers beef");
    expect(s.zh).toBe("串牛肉");
  });
  it("gives no Chinese when a word is unknown (no mixed languages)", () => {
    const s = suggestTranslation("Poulet yassa");
    expect(s.en).toBe("Chicken yassa");
    expect(s.zh).toBe("");
  });
});

describe("accent colour contrast", () => {
  it("computes WCAG ratios", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrastRatio("#0F6B3E", "#FFF8EC")).toBeGreaterThan(6);
  });
  it("accepts the brand green on light themes, refuses yellow", () => {
    expect(accentIsReadable("#0F6B3E", "warm")).toBe(true);
    expect(accentIsReadable("#E9B530", "light")).toBe(false);
  });
  it("needs a light accent on the dark lacquer theme", () => {
    expect(accentIsReadable("#E9B530", "lacquer")).toBe(true);
    expect(accentIsReadable("#0F6B3E", "lacquer")).toBe(false);
  });
});

describe("open now / closed (Africa/Ouagadougou = UTC)", () => {
  const hours = [
    { weekday: 1, opens: "10:00", closes: "23:00" },
    { weekday: 5, opens: "10:00", closes: "01:00" },
  ];
  it("is open during the day", () => {
    expect(openStatus(hours, new Date("2026-11-09T12:00:00Z"))).toEqual({ open: true, closesAt: "23:00" }); // Monday
  });
  it("is closed before opening and says when it opens", () => {
    expect(openStatus(hours, new Date("2026-11-09T08:00:00Z"))).toEqual({ open: false, opensAt: "10:00" });
  });
  it("handles service past midnight (Friday until 01:00)", () => {
    expect(openStatus(hours, new Date("2026-11-14T00:30:00Z")).open).toBe(true); // Saturday 00:30
    expect(openStatus(hours, new Date("2026-11-14T01:30:00Z")).open).toBe(false);
  });
  it("is closed on a day without hours", () => {
    expect(openStatus(hours, new Date("2026-11-10T12:00:00Z")).open).toBe(false); // Tuesday
  });
});

describe("Ma sélection", () => {
  const chicken = item({
    id: "c",
    price: null,
    variants: [
      { id: "half", name: { fr: "Demi" }, price: 3500 },
      { id: "whole", name: { fr: "Entier" }, price: 6500 },
    ],
    options: [{ id: "nochili", group: { fr: "Piment" }, name: { fr: "Sans piment" }, priceDelta: 0 }],
  });
  const fish = item({ id: "f", code: "13", name: { fr: "Poisson braisé" }, price: null });
  const juice = item({ id: "j", code: "40", name: { fr: "Jus de bissap" }, price: 500 });
  const data = { name: "Restaurant Démo", categories: [{ id: "x", name: { fr: "X" }, items: [chicken, fish, juice] }] } as unknown as PublicMenuData;
  const idx = indexItems(data);

  it("prices variants and options", () => {
    expect(unitPrice(chicken, "whole", ["nochili"])).toBe(6500);
    expect(unitPrice(fish, null, [])).toBeNull();
  });
  it("totals lines, keeps « sur demande » out of the sum and flags it", () => {
    let lines = addToCart([], "c", "whole", ["nochili"]);
    lines = addToCart(lines, "j");
    lines = addToCart(lines, "j");
    lines = addToCart(lines, "f");
    expect(cartTotals(idx, lines)).toEqual({ count: 4, total: 7500, hasOnRequest: true });
    lines = changeQty(lines, lines.find((l) => l.itemId === "j")!.key, -2);
    expect(cartTotals(idx, lines).count).toBe(2);
  });
  it("same dish + same choice = one line", () => {
    const lines = addToCart(addToCart([], "c", "half", []), "c", "half", []);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.qty).toBe(2);
  });
  it("builds the French WhatsApp takeaway message with numbers and total", () => {
    const lines = addToCart(addToCart(addToCart([], "c", "whole", []), "j"), "j");
    const msg = takeawayMessage(data, idx, lines, { name: "Awa", pickup: "12:30" });
    expect(msg).toContain("Bonjour Restaurant Démo, je souhaite commander à emporter");
    expect(msg).toContain(`- 1 × 10. Poulet bicyclette (Entier) : 6${N}500${N}F`);
    expect(msg).toContain(`- 2 × 40. Jus de bissap : 1${N}000${N}F`);
    expect(msg).toContain(`Total : 7${N}500${N}F`);
    expect(msg).toContain("Nom : Awa");
    expect(msg).toContain("Retrait vers : 12:30");
  });
});

describe("search across three languages", () => {
  const i = item({});
  it("matches French, English, Chinese and the dish number, ignoring accents", () => {
    expect(itemMatches(i, "poulet")).toBe(true);
    expect(itemMatches(i, "CHICKEN")).toBe(true);
    expect(itemMatches(i, "走地")).toBe(true);
    expect(itemMatches(i, "10")).toBe(true);
    expect(itemMatches(item({ name: { fr: "Dégué" } }), "degue")).toBe(true);
    expect(itemMatches(i, "pizza")).toBe(false);
  });
});

describe("public menu message format", () => {
  it("handles variables and plurals", () => {
    expect(format("Bienvenue au {name}", { name: "Démo" })).toBe("Bienvenue au Démo");
    const p = "{count, plural, one {# article} other {# articles}}";
    expect(format(p, { count: 1 })).toBe("1 article");
    expect(format(p, { count: 3 })).toBe("3 articles");
  });
});
