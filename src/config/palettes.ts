import type { MenuTheme } from "@/lib/color";

/**
 * Ready-made brand palettes for a business: a main colour (buttons, active tabs, cart: always
 * readable on its theme, checked by a unit test) and an accent colour (header band, « Nouveau »
 * badges, category titles' underline, confetti). Inspired by Burkina: bissap, karité, Faso Dan Fani…
 */
export type Palette = {
  key: string;
  main: string;
  accent: string;
  themes: readonly MenuTheme[];
};

const LIGHT = ["warm", "light"] as const;
const DARK = ["lacquer"] as const;

export const PALETTES: readonly Palette[] = [
  { key: "savane", main: "#0F6B3E", accent: "#E9B530", themes: LIGHT },
  { key: "bissap", main: "#8E1B3A", accent: "#E9B530", themes: LIGHT },
  { key: "karite", main: "#7A4A1E", accent: "#E9B530", themes: LIGHT },
  { key: "danfani", main: "#1F4E8C", accent: "#E04E39", themes: LIGHT },
  { key: "mangue", main: "#A8460C", accent: "#0F6B3E", themes: LIGHT },
  { key: "hibiscus", main: "#B0174F", accent: "#F6A821", themes: LIGHT },
  { key: "indigo", main: "#2E3A87", accent: "#F2B134", themes: LIGHT },
  { key: "ocean", main: "#0E6378", accent: "#F59E0B", themes: LIGHT },
  { key: "piment", main: "#B3261E", accent: "#0F6B3E", themes: LIGHT },
  { key: "gingembre", main: "#8A5300", accent: "#2F855A", themes: LIGHT },
  { key: "charbon", main: "#27272A", accent: "#E9B530", themes: LIGHT },
  { key: "laque", main: "#D9AD55", accent: "#C0392B", themes: DARK },
  { key: "safran", main: "#F2B134", accent: "#E04E39", themes: DARK },
  { key: "menthe", main: "#4ADE80", accent: "#E9B530", themes: DARK },
  { key: "corail", main: "#FF8A65", accent: "#FFD166", themes: DARK },
  { key: "ciel", main: "#7CC4FA", accent: "#F2B134", themes: DARK },
];

/** Default accent when a business never chose one: the RestoCool gold. */
export const DEFAULT_ACCENT2 = "#E9B530";
