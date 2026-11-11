"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { onAccent, type MenuTheme } from "@/lib/color";
import { AccentInput } from "./accent-input";
import { MediaInput } from "./media-input";

const THEME_BG: Record<MenuTheme, { bg: string; fg: string; muted: string }> = {
  warm: { bg: "#FFF8EC", fg: "#17231C", muted: "#5B6B60" },
  light: { bg: "#FFFFFF", fg: "#18181B", muted: "#71717A" },
  lacquer: { bg: "#160D0B", fg: "#F8EFE6", muted: "#C9B9AA" },
};

/**
 * Image de marque: logo, cover photo, theme and main colour, with a live preview of the top of
 * the customer's menu. The restaurant's brand comes first; RestoCool only shows in the footer.
 */
export function BrandingEditor({ name, initial }: { name: string; initial: { logoUrl: string | null; coverUrl: string | null; accentColor: string; theme: MenuTheme } }) {
  const t = useTranslations("settings.appearance");
  const [logo, setLogo] = useState(initial.logoUrl);
  const [cover, setCover] = useState(initial.coverUrl);
  const [look, setLook] = useState({ color: initial.accentColor, theme: initial.theme });
  const th = THEME_BG[look.theme];
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div>
            <MediaInput name="logoUrl" kind="logo" label={t("logo")} initial={initial.logoUrl} onChange={setLogo} />
            <p className="mt-1 text-xs text-muted-foreground">{t("logoHint")}</p>
          </div>
          <div>
            {!cover && (
              // Customers recognise the place before they read the name: ask for a real photo.
              <p className="mb-2 rounded-xl border-2 border-or bg-or/10 p-3 text-sm" role="note" data-testid="cover-reminder">
                <b>📸 {t("coverReminderTitle")}</b> {t("coverReminderText")}
              </p>
            )}
            <MediaInput name="coverUrl" kind="cover" label={t("cover")} initial={initial.coverUrl} onChange={setCover} />
            <p className="mt-1 text-xs text-muted-foreground">{t("coverHint")}</p>
          </div>
          <AccentInput initialColor={initial.accentColor} initialTheme={initial.theme} onChange={setLook} />
        </div>
        {/* Live preview of the menu header, as customers will see it. */}
        <figure className="flex flex-col gap-2 md:sticky md:top-20 md:self-start" data-testid="branding-preview">
          <figcaption className="text-sm font-semibold">{t("preview")}</figcaption>
          <div className="overflow-hidden rounded-2xl border border-border shadow-sm" style={{ background: th.bg, color: th.fg }}>
            <div className="h-24 bg-cover bg-center" style={cover ? { backgroundImage: `url(${cover})` } : { background: `linear-gradient(135deg, ${look.color}, ${look.color}99)` }} />
            <div className="flex items-center gap-3 px-4 pt-3 pb-4">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- uploaded logo preview
                <img src={logo} alt="" className="-mt-10 h-16 w-16 rounded-xl border-2 border-white bg-white object-cover shadow" />
              ) : (
                <span className="-mt-10 flex h-16 w-16 items-center justify-center rounded-xl border-2 border-white text-2xl font-extrabold shadow" style={{ background: look.color, color: onAccent(look.theme) }} aria-hidden>
                  {name.trim().charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                <p className="font-display truncate text-lg font-extrabold">{name}</p>
                <p className="text-xs" style={{ color: th.muted }}>
                  {t("previewTagline")}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t px-4 py-3" style={{ borderColor: `${th.muted}33` }}>
              <span className="text-sm font-semibold">{t("previewDish")}</span>
              <span className="flex h-10 w-10 items-center justify-center rounded-full text-xl font-bold" style={{ background: look.color, color: onAccent(look.theme) }} aria-hidden>
                +
              </span>
            </div>
          </div>
          {!logo && <p className="text-xs text-muted-foreground">{t("noLogoYet")}</p>}
        </figure>
      </div>
    </div>
  );
}
