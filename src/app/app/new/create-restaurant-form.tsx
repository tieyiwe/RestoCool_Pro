"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { slugify } from "@/lib/slug";
import { CityField } from "@/components/forms/city-field";
import { createRestaurantAction, type CreateRestaurantState } from "../actions";

export function CreateRestaurantForm() {
  const t = useTranslations("app.newRestaurant");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<CreateRestaurantState, FormData>(createRestaurantAction, undefined);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"restaurant" | "transport">("restaurant");
  const [city, setCity] = useState("Ouagadougou");
  // Live « Nom disponible ? »: checked shortly after typing stops; a taken name gets 1–3 suggestions.
  const [check, setCheck] = useState<{ for: string; available: boolean; suggestions: Array<{ name: string; slug: string }> } | null>(null);
  const [checking, setChecking] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    const n = name.trim();
    if (n.length < 2) return setCheck(null);
    const id = ++seq.current;
    setChecking(true);
    const timer = window.setTimeout(async () => {
      const res = await fetch(`/api/app/name-check?${new URLSearchParams({ name: n, city, kind })}`, { cache: "no-store" }).catch(() => null);
      if (id !== seq.current) return;
      setChecking(false);
      if (res?.ok) setCheck({ for: n, ...((await res.json()) as { available: boolean; suggestions: Array<{ name: string; slug: string }> }) });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [name, city, kind]);
  // The server's answer wins when it refused the name (someone took it in the meantime).
  const taken = (check && check.for === name.trim() && !check.available) || (state?.error === "taken" && state.name === name.trim());
  const suggestions = check && check.for === name.trim() && !check.available ? check.suggestions : state?.error === "taken" ? (state.suggestions ?? []) : [];
  const free = check && check.for === name.trim() && check.available && !taken;
  const error =
    state?.error === "name" ? t("errorName") : state?.error === "limit" ? t("errorLimit") : state?.error === "taken" ? null : state?.error ? tc("error") : null;
  const slug = name.trim().length >= 2 ? slugify(name) : null;
  const input = "min-h-12 w-full rounded-xl border border-border bg-background px-4 text-base outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15";

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {/* What kind of business: restaurants & co, or a VIP bus company serving food on board. */}
      <fieldset className="grid gap-3 sm:grid-cols-2" data-testid="kind-choice">
        <legend className="mb-2 text-sm font-bold">{t("kind")}</legend>
        {(["restaurant", "transport"] as const).map((k) => (
          <label
            key={k}
            className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-border p-4 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            data-testid={`kind-${k}`}
          >
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="mt-1 size-5 accent-[var(--color-primary)]" />
            <span>
              <span className="block text-2xl" aria-hidden>
                {k === "restaurant" ? "🍽️" : "🚌"}
              </span>
              <span className="block font-bold">{t(`kinds.${k}.title`)}</span>
              <span className="text-sm text-muted-foreground">{t(`kinds.${k}.text`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">{t("name")}</span>
        <input
          name="name"
          required
          minLength={2}
          maxLength={80}
          autoComplete="organization"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === "transport" ? t("namePlaceholderTransport") : t("namePlaceholder")}
          aria-invalid={state?.error === "name" || undefined}
          aria-describedby="name-hint name-status"
          className={input + " text-lg font-semibold"}
        />
        <span id="name-hint" className="text-xs text-muted-foreground">
          {t("nameHint")}
        </span>
        <span id="name-status" role="status" aria-live="polite" data-testid="name-status" data-state={taken ? "taken" : free ? "free" : checking ? "checking" : "idle"}>
          {taken ? (
            <span className="text-sm font-bold text-red-700">✗ {t("nameTaken")}</span>
          ) : free ? (
            <span className="text-sm font-bold text-emerald-700">✓ {t("nameAvailable")}</span>
          ) : checking && name.trim().length >= 2 ? (
            <span className="text-sm text-muted-foreground">{t("nameChecking")}</span>
          ) : null}
        </span>
      </label>
      {taken && (
        <div className="-mt-2 flex flex-col gap-2" data-testid="name-suggestions">
          <p className="text-sm">{suggestions.length ? t("nameSuggest") : t("nameNoSuggest")}</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.slug}
                type="button"
                onClick={() => setName(s.name)}
                className="min-h-11 rounded-full border-2 border-primary/40 bg-primary/5 px-4 text-sm font-semibold hover:border-primary"
                data-testid="name-suggestion"
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <CityField label={t("city")} className={input} onChange={setCity} />

      {/* Live preview of the menu address and the QR it will be printed on. */}
      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-4" data-testid="slug-preview" aria-live="polite">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface text-2xl shadow-sm" aria-hidden>
          🔳
        </span>
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-muted-foreground">{t("urlPreview")}</span>
          <span className="block truncate font-mono text-sm font-bold">
            restocool.com/r/<span className="text-primary">{slug ?? t("urlPlaceholder")}</span>
          </span>
        </span>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-900">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending || Boolean(taken)} className="min-h-14 rounded-xl text-lg">
        {pending ? t("submitting") : `${t("submit")} →`}
      </Button>
      <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-sm text-muted-foreground">
        <span>✓ {t("trial")}</span>
        <span>✓ {t("noCard")}</span>
      </p>
    </form>
  );
}
