/**
 * "Local" claims on the home page. Honesty rule (CLAUDE.md §1): switch one on ONLY when the
 * owner has confirmed it is true.
 */
export const LOCAL_CLAIMS = {
  /** « 100 % local » badge + « Fièrement burkinabè » — founder is Burkinabè. */
  founderBurkinabe: true, // confirmed by the founder (Nov 2026)
  /** « Support en français par WhatsApp, depuis le Burkina » — support people based in Burkina. */
  teamInBurkina: false,
  /** Mention of local partners. */
  localPartners: false,
} as const;

/**
 * Features listed on the home page and in /llms.txt, in order; `ready: false` shows « Bientôt ».
 * Honesty rule: mark a feature ready only when it works in the app today.
 */
export const LANDING_FEATURES = [
  { key: "menu", ready: true },
  { key: "photos", ready: true },
  { key: "qr", ready: true },
  { key: "seats", ready: true },
  { key: "whatsapp", ready: true },
  { key: "offline", ready: true },
  { key: "orders", ready: true },
  // Staff PIN login is live; cash-in and the end-of-day closing come with payments (M5).
  { key: "staff", ready: false },
  { key: "reservations", ready: false },
] as const;
