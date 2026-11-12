import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { NOINDEX } from "@/lib/seo/site";
import { publicHelpAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("aide"))("title"), robots: NOINDEX };
}

const field = "min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-base";

/**
 * restocool.com/aide: for someone who cannot sign in (forgotten PIN, locked, lost email).
 * Nothing about the business is shown back; TIBLOGICS calls back and verifies before acting.
 */
export default async function AidePage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const [t, ts, sp] = await Promise.all([getTranslations("aide"), getTranslations("support"), searchParams]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-4 py-10" data-testid="aide-page">
      <Link href="/" aria-label="RestoCool" className="self-start">
        <Logo />
      </Link>
      <div>
        <h1 className="font-display text-3xl font-extrabold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("intro")}</p>
      </div>
      {sp.sent ? (
        <div role="status" className="flex flex-col gap-3 rounded-3xl border border-emerald-300 bg-emerald-50 p-5 text-emerald-950" data-testid="aide-sent">
          <p className="text-lg font-bold">✓ {t("sent", { ref: /^D-\d{6}$/.test(sp.sent) ? sp.sent : "" })}</p>
          <p>{t("sentNext")}</p>
          <p className="text-sm font-semibold">🔒 {t("neverPin")}</p>
        </div>
      ) : (
        <form action={publicHelpAction} className="flex flex-col gap-4 rounded-3xl border border-border bg-surface p-5 shadow-sm" data-testid="aide-form">
          {sp.error && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-900">
              {sp.error === "tooMany" ? ts("tooMany") : ts("invalid")}
            </p>
          )}
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("rc")}</span>
            <input name="rc" required maxLength={20} autoCapitalize="characters" autoComplete="off" placeholder="RC-K7M3P" className="rc-code-input min-h-12 w-full rounded-xl px-3 text-lg font-bold tracking-widest" data-testid="aide-rc" />
            <span className="mt-1 block text-xs text-muted-foreground">{t("rcHint")}</span>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("businessName")}</span>
            <input name="businessName" required maxLength={120} className={field} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-semibold">{t("name")}</span>
              <input name="name" required maxLength={80} autoComplete="name" className={field} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-semibold">{t("phone")}</span>
              <input name="phone" required type="tel" maxLength={30} autoComplete="tel" placeholder="+226 70 00 00 00" className={field} />
            </label>
          </div>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("role")}</span>
            <select name="role" defaultValue="owner" className={field}>
              {(["owner", "manager", "staff"] as const).map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">{ts("urgency")}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {(["low", "medium", "high"] as const).map((u) => (
                <label key={u} className="flex min-h-12 items-center gap-2 rounded-xl border border-border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-muted">
                  <input type="radio" name="urgency" value={u} defaultChecked={u === "high"} required className="size-5" />
                  {ts(`urgencies.${u}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("body")}</span>
            <textarea name="body" required maxLength={2000} rows={4} placeholder={t("bodyPlaceholder")} className={`${field} py-2`} />
          </label>
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
          <button className="min-h-12 rounded-xl bg-primary px-5 font-bold text-primary-foreground" data-testid="aide-submit">
            {t("submit")}
          </button>
          <p className="text-xs text-muted-foreground">🔒 {t("neverPin")}</p>
        </form>
      )}
      <p className="text-sm text-muted-foreground">
        {t("signedIn")}{" "}
        <Link href="/app/support" className="font-semibold text-primary underline">
          {t("signedInLink")}
        </Link>
      </p>
    </main>
  );
}
