/**
 * Active UI languages. To add Mooré or Dioula later: add the code here and a
 * messages/<code>.json file. No other code change is needed.
 */
export const LOCALES = ["fr", "en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";
export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Planned, not yet active: "mos" (Mooré), "dyu" (Dioula). */
export const FUTURE_LOCALES = ["mos", "dyu"] as const;

export const LOCALE_LABELS: Record<Locale, string> = { fr: "Français", en: "English", zh: "中文" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Pick the best available translation from an { fr, en?, zh? } object. Falls back to French. */
export function pickText(text: { fr: string } & Partial<Record<string, string>> | null | undefined, locale: string): string {
  if (!text) return "";
  return text[locale]?.trim() || text.fr;
}
