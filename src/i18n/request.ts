import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE } from "./config";

/**
 * Locale is not in the URL (short, printable QR links).
 * - Staff/owner app: remembered in a cookie.
 * - Public menu: always rendered in French; the visitor's choice lives in
 *   sessionStorage for the current visit only (handled client-side in M2).
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE;
  return {
    locale,
    timeZone: "Africa/Ouagadougou",
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
