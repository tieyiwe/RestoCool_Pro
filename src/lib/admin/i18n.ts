import "server-only";
import { cookies } from "next/headers";
import { getFormatter, getTranslations } from "next-intl/server";

/**
 * The super admin console is in English by default, with French as the alternative (no Chinese),
 * independent of the language of the business app. The choice lives in its own cookie.
 */
export const ADMIN_LANG_COOKIE = "rc_admin_lang";
export type AdminLocale = "en" | "fr";

export async function adminLocale(): Promise<AdminLocale> {
  return (await cookies()).get(ADMIN_LANG_COOKIE)?.value === "fr" ? "fr" : "en";
}

/** Translations and formatter for the admin pages, in the admin language. */
export async function adminI18n() {
  const locale = await adminLocale();
  const [t, tp, format] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getTranslations({ locale, namespace: "app.plan" }),
    getFormatter({ locale }),
  ]);
  return { t, tp, format, locale };
}
