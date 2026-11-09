/**
 * Publisher details shown on /privacy and /terms.
 * RestoCool is a product of TIBLOGICS, a company based in the United States, part of Tilogroup.
 * TODO(owner): fill in the null values (legal form, state, address, contact email/WhatsApp).
 * Until then the pages show « [à compléter] » so nothing false is published.
 */
export const LEGAL = {
  product: "RestoCool",
  publisher: "TIBLOGICS",
  parentGroup: "Tilogroup",
  country: { fr: "États-Unis", en: "United States" },
  legalForm: null as string | null, // e.g. "LLC"
  state: null as string | null, // US state of registration, e.g. "Delaware" — also the governing law
  address: null as string | null, // registered address
  email: null as string | null, // e.g. "contact@restocool.com" — also used for privacy requests
  whatsapp: null as string | null, // e.g. "+226 …" or "+1 …"
  website: "https://restocool.com",
  /** Date these versions take effect (update when the text changes). */
  effectiveDate: "2026-11-09",
};

export const fillOr = (v: string | null, placeholder: string) => v ?? placeholder;

/** Where people remove RestoCool's access to their Google account. */
export const GOOGLE_PERMISSIONS_URL = "https://myaccount.google.com/permissions";
export const GOOGLE_USER_DATA_POLICY_URL = "https://developers.google.com/terms/api-services-user-data-policy";
