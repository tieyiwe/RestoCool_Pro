import { getLocale, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isLocale, LOCALE_COOKIE, LOCALE_LABELS, LOCALES } from "@/i18n/config";

async function setLocale(formData: FormData) {
  "use server";
  const value = formData.get("locale");
  if (!isLocale(value)) return;
  (await cookies()).set(LOCALE_COOKIE, value, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

/** Staff/owner language choice, remembered in a cookie. Works without client JS. */
export async function LocaleSwitcher() {
  const locale = await getLocale();
  const t = await getTranslations("common");
  return (
    <form action={setLocale} className="flex gap-1" aria-label={t("language")}>
      {LOCALES.map((l) => (
        <button
          key={l}
          name="locale"
          value={l}
          aria-pressed={l === locale}
          title={LOCALE_LABELS[l]}
          className="min-h-11 min-w-11 rounded-lg px-2 text-xs font-bold uppercase aria-pressed:bg-primary aria-pressed:text-primary-foreground hover:bg-muted"
        >
          {l}
        </button>
      ))}
    </form>
  );
}
