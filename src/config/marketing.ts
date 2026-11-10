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
