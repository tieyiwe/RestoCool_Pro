/**
 * RestoCool brand tokens (source: docs/brand/BRAND.md). Use these values in TypeScript
 * (charts, PDFs, QR cards, emails). Do not invent new colours.
 */
export const BRAND = {
  vert: "#0F6B3E", // primary buttons, links, active tabs — creme text 6.2:1
  nuit: "#0B3D26", // hero, footer, premium sections, dark-mode background
  or: "#E9B530", // star, badges, highlights, dark-mode primary — encre text 8.6:1
  laterite: "#B24A26", // errors, alerts, "spicy", destructive — creme text 5.1:1
  creme: "#FFF8EC", // main light background
  sable: "#F1E6D0", // cards, secondary panels
  encre: "#17231C", // body text
  encre2: "#3E4A42", // secondary text
  ligne: "#E4D9C2", // borders
} as const;

/** Order status colours (always paired with an icon or label). */
export const STATUS_COLORS = {
  sent: BRAND.or,
  confirmed: BRAND.vert,
  preparing: BRAND.vert,
  ready: "#2F7DD1",
  served: BRAND.encre2,
  cancelled: BRAND.laterite,
} as const;
