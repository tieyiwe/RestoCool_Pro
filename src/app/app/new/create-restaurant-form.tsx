"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { createRestaurantAction, type CreateRestaurantState } from "../actions";

export function CreateRestaurantForm() {
  const t = useTranslations("app.newRestaurant");
  const tc = useTranslations("common");
  const [state, action, pending] = useActionState<CreateRestaurantState, FormData>(createRestaurantAction, undefined);
  const error = state?.error === "name" ? t("errorName") : state?.error === "limit" ? t("errorLimit") : state?.error ? tc("error") : null;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">{t("name")}</span>
        <input
          name="name"
          required
          minLength={2}
          maxLength={80}
          autoComplete="organization"
          placeholder={t("namePlaceholder")}
          aria-invalid={state?.error === "name" || undefined}
          className="min-h-11 rounded-lg border border-border bg-surface px-3"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">{t("city")}</span>
        <input name="city" defaultValue="Ouagadougou" maxLength={60} autoComplete="address-level2" className="min-h-11 rounded-lg border border-border bg-surface px-3" />
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? t("submitting") : t("submit")}
      </Button>
      <p className="text-center text-sm text-muted-foreground">{t("trial")}</p>
    </form>
  );
}
