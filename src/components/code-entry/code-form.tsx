import { getTranslations } from "next-intl/server";
import { CodeTypeahead } from "./code-typeahead";

/** « J'ai un code » form: a plain GET form to /c, so it works without JavaScript. */
export async function CodeForm({ error, defaultValue, compact = false }: { error?: string | null; defaultValue?: string; compact?: boolean }) {
  const t = await getTranslations("codeEntry");
  return (
    <form action="/c" method="get" className="flex flex-col gap-2" data-testid="code-form">
      {!compact && <p className="text-sm text-muted-foreground">{t("hint")}</p>}
      <label htmlFor="code-input" className="text-sm font-semibold">
        {t("label")}
      </label>
      <CodeTypeahead
        defaultValue={defaultValue}
        error={Boolean(error)}
        labels={{ label: t("label"), placeholder: t("placeholder"), submit: t("submit"), suggestions: t("suggestions"), recent: t("recent"), remove: t("remove"), open: t("open") }}
      />
      {error && (
        <p id="code-error" role="alert" className="text-sm font-semibold text-red-700 dark:text-red-400" data-testid="code-error">
          {t(error as "invalid" | "notFound" | "tooMany")}
        </p>
      )}
    </form>
  );
}
