"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { accentIsReadable, type MenuTheme } from "@/lib/color";

/** Colour picker with a live readability check against the chosen theme. */
export function AccentInput({ initialColor, initialTheme }: { initialColor: string; initialTheme: MenuTheme }) {
  const t = useTranslations("settings.appearance");
  const [color, setColor] = useState(initialColor);
  const [theme, setTheme] = useState<MenuTheme>(initialTheme);
  const ok = accentIsReadable(color, theme);
  const previews: Record<MenuTheme, { bg: string; fg: string }> = {
    warm: { bg: "#FFF8EC", fg: "#17231C" },
    light: { bg: "#FFFFFF", fg: "#18181B" },
    lacquer: { bg: "#160D0B", fg: "#F8EFE6" },
  };
  return (
    <>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t("theme")}</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(previews) as MenuTheme[]).map((th) => (
            <label key={th} className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-border p-2 has-checked:border-primary">
              <input type="radio" name="theme" value={th} checked={theme === th} onChange={() => setTheme(th)} className="sr-only" />
              <span className="flex h-12 w-full items-center justify-center rounded-md text-sm font-bold" style={{ background: previews[th].bg, color: previews[th].fg }}>
                Aa <span className="ml-1" style={{ color }}>●</span>
              </span>
              <span className="text-xs font-semibold">{t(`themes.${th}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold">{t("accent")}</span>
        <span className="flex items-center gap-3">
          <input type="color" name="accentColor" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} className="h-11 w-16 rounded-lg border border-border" />
          <code className="text-sm">{color}</code>
          <span className={ok ? "text-sm font-semibold text-vert" : "text-sm font-semibold text-danger"} role="status">
            {ok ? `✓ ${t("contrastOk")}` : `⚠ ${t("contrastLow")}`}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">{t("accentHint")}</span>
      </label>
    </>
  );
}
