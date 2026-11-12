import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "./config";

/**
 * Locale is not in the URL (short, printable QR links).
 * - Staff/owner app: remembered in a cookie.
 * - Explicit locale (getTranslations({ locale })): the super admin console (EN/FR) and emails.
 * - Public menu: always rendered in French; the visitor's choice lives in
 *   sessionStorage for the current visit only (handled client-side in M2).
 */
export default getRequestConfig(async ({ locale: explicit }) => {
  // A language asked for explicitly (super admin console, emails…) wins over the visitor's cookie.
  const fromCookie = isLocale(explicit) ? null : (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(explicit) ? explicit : isLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE;
  return {
    locale,
    timeZone: "Africa/Ouagadougou",
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
