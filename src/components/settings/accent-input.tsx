"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { PALETTES } from "@/config/palettes";
import { accentIsReadable, textOn, type MenuTheme } from "@/lib/color";

export type Look = { color: string; accent2: string; theme: MenuTheme };

/**
 * Theme, then a ready-made palette (main colour + accent colour) or each colour by hand. The main
 * colour is checked for readability on the theme; palettes shown are the ones that read well on it.
 */
export function AccentInput({
  initial,
  onChange,
}: {
  initial: Look;
  onChange?: (v: Look) => void;
}) {
  const t = useTranslations("settings.appearance");
  const [look, setLookState] = useState<Look>(initial);
  const setLook = (patch: Partial<Look>) => {
    const next = { ...look, ...patch };
    setLookState(next);
    onChange?.(next);
  };
  const setTheme = (theme: MenuTheme) => {
    // A main colour that no longer reads on the new theme is replaced by that theme's first palette.
    if (accentIsReadable(look.color, theme)) return setLook({ theme });
    const p = PALETTES.find((x) => x.themes.includes(theme))!;
    setLook({ theme, color: p.main, accent2: p.accent });
  };
  const ok = accentIsReadable(look.color, look.theme);
  const previews: Record<MenuTheme, { bg: string; fg: string }> = {
    warm: { bg: "#FFF8EC", fg: "#17231C" },
    light: { bg: "#FFFFFF", fg: "#18181B" },
    lacquer: { bg: "#160D0B", fg: "#F8EFE6" },
  };
  const palettes = PALETTES.filter((p) => p.themes.includes(look.theme));
  const current = palettes.find(
    (p) =>
      p.main === look.color.toUpperCase() &&
      p.accent === look.accent2.toUpperCase(),
  )?.key;
  return (
    <>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t("theme")}</legend>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(previews) as MenuTheme[]).map((th) => (
            <label
              key={th}
              className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-border p-2 has-checked:border-primary"
            >
              <input
                type="radio"
                name="theme"
                value={th}
                checked={look.theme === th}
                onChange={() => setTheme(th)}
                className="sr-only"
              />
              <span
                className="flex h-12 w-full items-center justify-center rounded-md text-sm font-bold"
                style={{ background: previews[th].bg, color: previews[th].fg }}
              >
                Aa{" "}
                <span className="ml-1" style={{ color: look.color }}>
                  ●
                </span>
              </span>
              <span className="text-xs font-semibold">{t(`themes.${th}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset data-testid="palettes">
        <legend className="mb-1 text-sm font-semibold">{t("palettes")}</legend>
        <p className="mb-2 text-xs text-muted-foreground">
          {t("palettesHint")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {palettes.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setLook({ color: p.main, accent2: p.accent })}
              aria-pressed={current === p.key}
              className="flex min-h-12 items-center gap-2 rounded-xl border-2 border-border p-2 text-left text-sm font-semibold aria-pressed:border-primary aria-pressed:bg-primary/5"
              data-testid={`palette-${p.key}`}
            >
              <span
                className="flex shrink-0 overflow-hidden rounded-lg border border-border"
                aria-hidden
              >
                <span className="h-8 w-6" style={{ background: p.main }} />
                <span className="h-8 w-4" style={{ background: p.accent }} />
              </span>
              <span className="min-w-0 leading-tight">
                {t(`palette.${p.key}` as "palette.savane")}
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">{t("accent")}</span>
          <span className="flex items-center gap-3">
            <input
              type="color"
              name="accentColor"
              value={look.color}
              onChange={(e) => setLook({ color: e.target.value.toUpperCase() })}
              className="h-11 w-16 rounded-lg border border-border"
              data-testid="main-color"
            />
            <code className="text-sm">{look.color}</code>
          </span>
          <span
            className={
              ok
                ? "text-sm font-semibold text-vert"
                : "text-sm font-semibold text-danger"
            }
            role="status"
          >
            {ok ? `✓ ${t("contrastOk")}` : `⚠ ${t("contrastLow")}`}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("accentHint")}
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold">{t("accent2")}</span>
          <span className="flex items-center gap-3">
            <input
              type="color"
              name="accent2"
              value={look.accent2}
              onChange={(e) =>
                setLook({ accent2: e.target.value.toUpperCase() })
              }
              className="h-11 w-16 rounded-lg border border-border"
              data-testid="accent2-color"
            />
            <code className="text-sm">{look.accent2}</code>
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={{ background: look.accent2, color: textOn(look.accent2) }}
            >
              {t("previewNew")}
            </span>
          </span>
          <span className="text-xs text-muted-foreground">
            {t("accent2Hint")}
          </span>
        </label>
      </div>
    </>
  );
}
