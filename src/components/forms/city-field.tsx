"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { BF_CITIES, BF_CITIES_OTHER, BF_CITIES_TOP } from "@/config/cities";

const OTHER = "__other__";
const same = (a: string, b: string) => a.localeCompare(b, "fr", { sensitivity: "base" }) === 0;

/**
 * City: a list of Burkina's towns (works on every phone, unlike a datalist), with « Autre ville… »
 * to type any other place. The form receives one `city` value either way.
 */
export function CityField({
  defaultValue = "Ouagadougou",
  className,
  label,
  required = false,
  name = "city",
  id = "city-select",
  onChange,
}: {
  defaultValue?: string;
  className: string;
  label: string;
  required?: boolean;
  /** Form field name (« city », or « origin » / « destination » for an itinerary). */
  name?: string;
  id?: string;
  /** Called with the town each time it changes. */
  onChange?: (city: string) => void;
}) {
  const t = useTranslations("common.city");
  const known = BF_CITIES.find((c) => same(c, defaultValue));
  const [choice, setChoice] = useState(known ?? (defaultValue ? OTHER : BF_CITIES_TOP[0]));
  const [typed, setTyped] = useState(known ? "" : defaultValue);
  const value = choice === OTHER ? typed : choice;
  useEffect(() => onChange?.(value), [value]); // eslint-disable-line react-hooks/exhaustive-deps -- report value changes only
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      {/* The visible field itself carries the value (no hidden copy): what the form sends is always
          what is on screen, even if the person chose before the page finished loading. */}
      <select id={id} name={choice === OTHER ? undefined : name} value={choice} onChange={(e) => setChoice(e.target.value)} className={className} data-testid={id}>
        <optgroup label={t("main")}>
          {BF_CITIES_TOP.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </optgroup>
        <optgroup label={t("others")}>
          {BF_CITIES_OTHER.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </optgroup>
        <option value={OTHER}>{t("other")}</option>
      </select>
      {choice === OTHER && (
        <input
          name={name}
          aria-label={t("typeLabel")}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          maxLength={60}
          required={required}
          autoFocus
          autoComplete="address-level2"
          placeholder={t("placeholder")}
          className={className}
          data-testid={`${id}-other`}
        />
      )}
    </div>
  );
}
