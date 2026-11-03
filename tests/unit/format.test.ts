import { describe, expect, it } from "vitest";
import { formatBfPhone, formatFCFA, normalizeBfPhone, whatsappHref } from "@/lib/format";
import { pickText } from "@/i18n/config";
import { slugify } from "@/lib/slug";

const N = " ";

describe("formatFCFA", () => {
  it("uses narrow spaces and the F suffix", () => {
    expect(formatFCFA(5300)).toBe(`5${N}300${N}F`);
    expect(formatFCFA(48000)).toBe(`48${N}000${N}F`);
    expect(formatFCFA(1250000)).toBe(`1${N}250${N}000${N}F`);
    expect(formatFCFA(500)).toBe(`500${N}F`);
    expect(formatFCFA(0)).toBe(`0${N}F`);
  });
  it("returns null for a missing price (rendered as « Sur demande », never 0 F)", () => {
    expect(formatFCFA(null)).toBeNull();
    expect(formatFCFA(undefined)).toBeNull();
  });
});

describe("Burkina phone numbers", () => {
  it("normalizes common inputs", () => {
    for (const input of ["+226 77 29 98 78", "0022677299878", "77299878", "226-77-29-98-78"]) {
      expect(normalizeBfPhone(input)).toBe("22677299878");
    }
    expect(normalizeBfPhone("12345")).toBeNull();
  });
  it("formats for display", () => {
    expect(formatBfPhone("77299878")).toBe("+226 77 29 98 78");
  });
  it("builds a free WhatsApp click-to-chat link", () => {
    expect(whatsappHref("77299878", "Bonjour !")).toBe("https://wa.me/22677299878?text=Bonjour%20!");
  });
});

describe("pickText", () => {
  it("falls back to French", () => {
    expect(pickText({ fr: "Riz gras", zh: "油焖饭" }, "zh")).toBe("油焖饭");
    expect(pickText({ fr: "Riz gras" }, "en")).toBe("Riz gras");
  });
});

describe("slugify", () => {
  it("strips accents and punctuation", () => {
    expect(slugify("Chez Fatou — Ouaga 2000")).toBe("chez-fatou-ouaga-2000");
    expect(slugify("Maquis Le Bon Goût")).toBe("maquis-le-bon-gout");
  });
});
