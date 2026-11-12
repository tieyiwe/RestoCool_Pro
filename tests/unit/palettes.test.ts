import { describe, expect, it } from "vitest";
import fr from "@/messages/fr.json";
import en from "@/messages/en.json";
import zh from "@/messages/zh.json";
import { PALETTES } from "@/config/palettes";
import { accentIsReadable, textOn } from "@/lib/color";

describe("brand palettes", () => {
  it("every main colour reads well on the themes it is offered for", () => {
    for (const p of PALETTES) for (const th of p.themes) expect(accentIsReadable(p.main, th), `${p.key} on ${th}`).toBe(true);
  });
  it("every theme has palettes to choose from", () => {
    for (const th of ["warm", "light", "lacquer"] as const) expect(PALETTES.filter((p) => p.themes.includes(th)).length).toBeGreaterThanOrEqual(5);
  });
  it("keys are unique and every palette has a name in the 3 languages", () => {
    expect(new Set(PALETTES.map((p) => p.key)).size).toBe(PALETTES.length);
    for (const m of [fr, en, zh]) for (const p of PALETTES) expect((m.settings.appearance.palette as Record<string, string>)[p.key]).toBeTruthy();
  });
  it("text on the accent colour picks black or white for contrast", () => {
    expect(textOn("#E9B530")).toBe("#17231C");
    expect(textOn("#0F6B3E")).toBe("#FFFFFF");
  });
});
