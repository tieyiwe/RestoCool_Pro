/** WCAG contrast helpers (accent colour validation). */
export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

export function contrastRatio(a: string, b: string): number {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return 1;
  const [l1, l2] = [luminance(ca), luminance(cb)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

export const THEME_BACKGROUNDS = { light: "#FFFFFF", warm: "#FFF8EC", lacquer: "#160D0B" } as const;
export type MenuTheme = keyof typeof THEME_BACKGROUNDS;

/**
 * The accent is used for headings and button backgrounds on the public menu.
 * Light themes: white text on the accent must reach 4.5:1 (and so does the accent on cream).
 * Lacquer (dark): the accent must reach 4.5:1 on the dark background (buttons use dark text).
 */
export function accentIsReadable(accent: string, theme: MenuTheme): boolean {
  if (theme === "lacquer") return contrastRatio(accent, THEME_BACKGROUNDS.lacquer) >= 4.5;
  return contrastRatio(accent, "#FFFFFF") >= 4.5 && contrastRatio(accent, THEME_BACKGROUNDS[theme]) >= 4.2;
}

/** Text colour to put on an accent-coloured button. */
export function onAccent(theme: MenuTheme): string {
  return theme === "lacquer" ? "#17231C" : "#FFFFFF";
}

/** Black or white, whichever reads best on a background (for badges on the accent colour). */
export function textOn(bg: string): string {
  return contrastRatio(bg, "#17231C") >= contrastRatio(bg, "#FFFFFF") ? "#17231C" : "#FFFFFF";
}
