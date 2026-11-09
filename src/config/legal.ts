/**
 * Publisher details shown on /privacy and /terms.
 * TODO(owner): fill in the null values (legal form, RCCM, IFU, address, contact email/WhatsApp).
 * Until then the pages show « [à compléter] » so nothing false is published.
 */
export const LEGAL = {
  product: "RestoCool",
  publisher: "TIBLOGICS",
  legalForm: null as string | null, // e.g. "SARL"
  rccm: null as string | null, // Registre du commerce (RCCM)
  ifu: null as string | null, // Identifiant financier unique
  address: null as string | null, // e.g. "Ouagadougou, Burkina Faso"
  email: null as string | null, // e.g. "contact@restocool.com"
  whatsapp: null as string | null, // e.g. "+226 …"
  website: "https://restocool.com",
  /** Date these versions take effect (update when the text changes). */
  effectiveDate: "2026-11-09",
};

export const fillOr = (v: string | null, placeholder: string) => v ?? placeholder;
