"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useFieldArray, useForm, type FieldPath } from "react-hook-form";
import { saveItemAction } from "@/app/app/menu/actions";
import { Button } from "@/components/ui/button";
import { suggestTranslation } from "@/lib/menu/glossary";
import { ITEM_TAGS, ItemInput, STATIONS, type ItemFormValues } from "@/lib/menu/schemas";
import { PhotoField } from "./photo-field";

const input = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 aria-invalid:border-danger";
const label = "mb-1 block text-sm font-semibold";

/** "3 500", "3500 F" → 3500. Empty → null. */
const toInt = (v: unknown): number | null => {
  if (typeof v === "number") return v;
  const digits = String(v ?? "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
};

export function ItemForm({
  itemId,
  categories,
  defaultValues,
}: {
  itemId?: string;
  categories: Array<{ id: string; name: string }>;
  defaultValues: ItemFormValues;
}) {
  const t = useTranslations("menuAdmin");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [suggestNote, setSuggestNote] = useState<string | null>(null);
  const [onRequest, setOnRequest] = useState(defaultValues.price === null && !(defaultValues.variants?.length ?? 0));

  const form = useForm<ItemFormValues, unknown, ItemInput>({ resolver: zodResolver(ItemInput), defaultValues });
  const { register, handleSubmit, control, setValue, watch, formState } = form;
  const variants = useFieldArray({ control, name: "variants" });
  const options = useFieldArray({ control, name: "options" });
  const photoUrl = watch("photoUrl");
  const thumbUrl = watch("thumbUrl");
  const err = (name: FieldPath<ItemFormValues>) => Boolean(form.getFieldState(name, formState).error);

  function suggest(field: "name" | "description") {
    const fr = form.getValues(`${field}.fr`) ?? "";
    const s = suggestTranslation(fr);
    if (!s.en && !s.zh) {
      setSuggestNote(t("item.suggestNone"));
      return;
    }
    if (s.en) setValue(`${field}.en`, s.en, { shouldDirty: true });
    if (s.zh) setValue(`${field}.zh`, s.zh, { shouldDirty: true });
    setSuggestNote(s.zh ? null : t("item.suggestNone"));
  }

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const res = await saveItemAction(itemId, values);
      if (res.ok) {
        // The action revalidates /app/menu; a refresh here would race the navigation.
        router.push("/app/menu");
      } else {
        setServerError(res.error === "plan_limit" ? t("planLimit") : t("errorGeneric"));
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <section className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <label>
          <span className={label}>{t("item.category")}</span>
          <select {...register("categoryId")} className={input}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>{t("item.code")}</span>
          <input {...register("code")} inputMode="numeric" maxLength={12} className={input} />
        </label>
      </section>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-base font-bold">{t("item.name")}</legend>
        <label>
          <span className={label}>{t("item.nameFr")} *</span>
          <input {...register("name.fr")} aria-invalid={err("name.fr")} maxLength={120} className={input} data-testid="name-fr" />
          {err("name.fr") && <span className="text-sm text-danger">{t("item.required")}</span>}
        </label>
        <div>
          <button type="button" onClick={() => suggest("name")} className="min-h-11 rounded-lg bg-muted px-3 text-sm font-semibold hover:opacity-90">
            ✨ {t("item.suggest")}
          </button>
          <p className="mt-1 text-xs text-muted-foreground">{t("item.suggestHint")}</p>
          {suggestNote && (
            <p className="mt-1 text-sm text-muted-foreground" role="status">
              {suggestNote}
            </p>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className={label}>{t("item.nameEn")}</span>
            <input {...register("name.en")} maxLength={120} className={input} data-testid="name-en" />
          </label>
          <label>
            <span className={label}>{t("item.nameZh")}</span>
            <input {...register("name.zh")} maxLength={120} lang="zh" className={input} data-testid="name-zh" />
          </label>
        </div>
      </fieldset>

      <details className="rounded-lg border border-border p-3">
        <summary className="flex min-h-11 cursor-pointer items-center font-bold">{t("item.description")}</summary>
        <div className="mt-2 flex flex-col gap-3">
          <label>
            <span className={label}>{t("item.descFr")}</span>
            <textarea {...register("description.fr")} rows={2} maxLength={600} className={input + " py-2"} />
          </label>
          <button type="button" onClick={() => suggest("description")} className="min-h-11 self-start rounded-lg bg-muted px-3 text-sm font-semibold">
            ✨ {t("item.suggest")}
          </button>
          <label>
            <span className={label}>{t("item.descEn")}</span>
            <textarea {...register("description.en")} rows={2} maxLength={600} className={input + " py-2"} />
          </label>
          <label>
            <span className={label}>{t("item.descZh")}</span>
            <textarea {...register("description.zh")} rows={2} maxLength={600} lang="zh" className={input + " py-2"} />
          </label>
        </div>
      </details>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-base font-bold">{t("item.price")}</legend>
        {variants.fields.length === 0 && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={onRequest}
                className="h-5 w-5"
                onChange={(e) => {
                  setOnRequest(e.target.checked);
                  if (e.target.checked) setValue("price", null);
                }}
              />
              {t("item.onRequest")} <span className="text-muted-foreground">— {t("item.onRequestHint")}</span>
            </label>
            {!onRequest && (
              <label>
                <span className="sr-only">{t("item.price")}</span>
                <input
                  {...register("price", { setValueAs: toInt })}
                  inputMode="numeric"
                  placeholder="2 500"
                  aria-invalid={err("price")}
                  className={input + " max-w-48 tabular-nums"}
                  data-testid="price"
                />
                {err("price") && <span className="block text-sm text-danger">{t("item.priceInvalid")}</span>}
              </label>
            )}
          </>
        )}

        <div className="rounded-lg border border-border p-3">
          <p className="font-semibold">{t("item.variants")}</p>
          <p className="mb-2 text-xs text-muted-foreground">{t("item.variantsHint")}</p>
          {variants.fields.map((f, i) => (
            <div key={f.id} className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_8rem_auto]">
              <input {...register(`variants.${i}.name.fr`)} placeholder={t("item.variantName")} aria-label={`${t("item.variantName")} FR`} className={input + " col-span-2 sm:col-span-1"} />
              <input {...register(`variants.${i}.name.en`)} placeholder="EN" aria-label={`${t("item.variantName")} EN`} className={input} />
              <input {...register(`variants.${i}.name.zh`)} placeholder="中文" aria-label={`${t("item.variantName")} ZH`} className={input} />
              <input
                {...register(`variants.${i}.price`, { setValueAs: toInt })}
                inputMode="numeric"
                placeholder={t("item.variantPrice")}
                aria-label={t("item.variantPrice")}
                aria-invalid={err(`variants.${i}.price`)}
                className={input + " tabular-nums"}
              />
              <button type="button" onClick={() => variants.remove(i)} className="min-h-11 rounded-lg px-2 text-sm text-danger hover:bg-muted">
                {t("item.remove")}
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => variants.append({ name: { fr: "", en: "", zh: "" }, price: 0 })}
            className="min-h-11 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-muted"
          >
            + {t("item.addVariant")}
          </button>
        </div>

        <details className="rounded-lg border border-border p-3" open={(options.fields.length ?? 0) > 0}>
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold">{t("item.options")}</summary>
          <p className="mb-2 text-xs text-muted-foreground">{t("item.optionsHint")}</p>
          {options.fields.map((f, i) => (
            <div key={f.id} className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_7rem_auto]">
              <input {...register(`options.${i}.group.fr`)} placeholder={t("item.optionGroup")} aria-label={t("item.optionGroup")} className={input} />
              <input {...register(`options.${i}.name.fr`)} placeholder={t("item.optionName")} aria-label={t("item.optionName")} className={input} />
              <input {...register(`options.${i}.priceDelta`, { setValueAs: (v) => toInt(v) ?? 0 })} inputMode="numeric" placeholder="0" aria-label={t("item.optionDelta")} className={input + " tabular-nums"} />
              <button type="button" onClick={() => options.remove(i)} className="min-h-11 rounded-lg px-2 text-sm text-danger hover:bg-muted">
                {t("item.remove")}
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => options.append({ group: { fr: "", en: "", zh: "" }, name: { fr: "", en: "", zh: "" }, priceDelta: 0 })}
            className="min-h-11 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-muted"
          >
            + {t("item.addOption")}
          </button>
        </details>
      </fieldset>

      <PhotoField
        kind="item"
        label={t("item.photo")}
        value={photoUrl ? { fullUrl: photoUrl, thumbUrl: thumbUrl ?? photoUrl } : null}
        onChange={(v) => {
          setValue("photoUrl", v?.fullUrl ?? null, { shouldDirty: true });
          setValue("thumbUrl", v?.thumbUrl ?? null, { shouldDirty: true });
        }}
      />

      <section className="grid gap-4 sm:grid-cols-2">
        <fieldset>
          <legend className={label}>{t("item.spicy")}</legend>
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2].map((n) => (
              <label key={n} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm has-checked:border-primary has-checked:bg-muted">
                <input
                  type="radio"
                  name="spicy"
                  value={n}
                  checked={Number(watch("spicy") ?? 0) === n}
                  onChange={() => setValue("spicy", n, { shouldDirty: true })}
                  className="h-4 w-4"
                />
                {t(`item.spicy${n}` as "item.spicy0")} {"🌶️".repeat(n)}
              </label>
            ))}
          </div>
        </fieldset>
        <label>
          <span className={label}>{t("item.station")}</span>
          <select {...register("station")} className={input}>
            {STATIONS.map((s) => (
              <option key={s} value={s}>
                {t(`stationName.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </section>

      <fieldset>
        <legend className={label}>{t("item.tags")}</legend>
        <div className="flex flex-wrap gap-2">
          {ITEM_TAGS.map((tag) => (
            <label key={tag} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm has-checked:border-primary has-checked:bg-muted">
              <input type="checkbox" value={tag} {...register("tags")} className="h-4 w-4" />
              {t(`tag.${tag}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2">
        <input type="checkbox" {...register("available")} className="h-5 w-5" />
        {t("item.available")}
      </label>

      {serverError && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {serverError}
        </p>
      )}
      {Object.keys(formState.errors).length > 0 && !serverError && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {t("errorGeneric")}
        </p>
      )}

      <div className="safe-bottom sticky bottom-0 flex gap-3 border-t border-border bg-background py-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? t("item.saving") : t("item.save")}
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={() => router.push("/app/menu")}>
          {t("item.cancel")}
        </Button>
      </div>
    </form>
  );
}
