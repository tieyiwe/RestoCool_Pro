/** Looks for promotions (platform campaigns and business offers): background, text, accent. */
export const PROMO_THEMES = {
  gold: { bg: "#E9B530", fg: "#17231C", accent: "#0B3D26" },
  green: { bg: "#0F6B3E", fg: "#FFF8EC", accent: "#E9B530" },
  lacquer: { bg: "#8E1B12", fg: "#FFF3DC", accent: "#E9B530" },
  night: { bg: "#10231A", fg: "#FFF8EC", accent: "#E9B530" },
  sunset: { bg: "#E2572C", fg: "#FFFFFF", accent: "#FFE08A" },
  sky: { bg: "#1F6FB2", fg: "#FFFFFF", accent: "#FFE08A" },
  cream: { bg: "#FFF3DC", fg: "#17231C", accent: "#B24A26" },
} as const;
export type PromoTheme = keyof typeof PROMO_THEMES;
export const PROMO_THEME_IDS = Object.keys(PROMO_THEMES) as PromoTheme[];
export const promoTheme = (id: string | null | undefined) => PROMO_THEMES[(id as PromoTheme) in PROMO_THEMES ? (id as PromoTheme) : "gold"];
