import { getTranslations } from "next-intl/server";

/** « J'ai un code » form: a plain GET form to /c, so it works without JavaScript. */
export async function CodeForm({ error, defaultValue, compact = false }: { error?: string | null; defaultValue?: string; compact?: boolean }) {
  const t = await getTranslations("codeEntry");
  return (
    <form action="/c" method="get" className="flex flex-col gap-2" data-testid="code-form">
      {!compact && <p className="text-sm text-muted-foreground">{t("hint")}</p>}
      <label htmlFor="code-input" className="text-sm font-semibold">
        {t("label")}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="code-input"
          name="code"
          required
          defaultValue={defaultValue}
          maxLength={12}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder={t("placeholder")}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "code-error" : undefined}
          className="rc-code-input min-h-12 w-52 rounded-lg px-3 text-center font-mono text-xl font-bold tracking-[0.2em] uppercase"
        />
        <button type="submit" className="min-h-12 rounded-lg bg-primary px-5 font-semibold text-primary-foreground hover:opacity-90">
          {t("submit")}
        </button>
      </div>
      {error && (
        <p id="code-error" role="alert" className="text-sm font-semibold text-red-700 dark:text-red-400" data-testid="code-error">
          {t(error as "invalid" | "notFound" | "tooMany")}
        </p>
      )}
    </form>
  );
}
