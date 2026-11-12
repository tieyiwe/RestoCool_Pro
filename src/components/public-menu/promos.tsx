"use client";

import { useEffect } from "react";
import { promoTheme } from "@/config/promo-themes";
import { formatFCFA } from "@/lib/format";
import type { makeT } from "@/lib/public-menu/translate";
import type { PublicItem, PublicPromo } from "@/lib/public-menu/types";
import { trackPromo } from "@/components/promo/track";

type T = ReturnType<typeof makeT>;
type Lang = "fr" | "en" | "zh";
const pick = (x: { fr: string } & Partial<Record<string, string>> | null | undefined, lang: Lang) => (x ? x[lang]?.trim() || x.fr : "");

/**
 * « Offres du moment »: the business's running offers, right under its header (the first thing
 * seen after the name), as cards to swipe; a tap opens the details.
 */
export function PromoStrip({ promos, items, lang, t, onOpen }: { promos: PublicPromo[]; items: Map<string, PublicItem>; lang: Lang; t: T; onOpen: (id: string) => void }) {
  useEffect(() => {
    for (const p of promos) trackPromo(p.id, "view");
  }, [promos]);
  if (!promos.length) return null;
  return (
    <section aria-label={t("offersTitle")} className="mx-auto max-w-3xl px-3 pt-3" data-testid="promo-strip">
      <p className="mb-2 flex items-center gap-1.5 text-sm font-extrabold tracking-wide uppercase">
        <span aria-hidden>🔥</span> {t("offersTitle")}
      </p>
      <ul className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
        {promos.map((p) => {
          const th = promoTheme(p.theme);
          const item = p.itemId ? items.get(p.itemId) : undefined;
          return (
            <li key={p.id} className="w-[78%] max-w-sm shrink-0 snap-start sm:w-72">
              <button
                type="button"
                onClick={() => {
                  trackPromo(p.id, "click");
                  onOpen(p.id);
                }}
                className="relative flex h-full min-h-28 w-full flex-col justify-between overflow-hidden rounded-2xl p-4 text-left shadow-md"
                style={{ background: th.bg, color: th.fg }}
                data-testid="promo-card"
              >
                <span aria-hidden className="pointer-events-none absolute -top-6 -right-6 size-24 rounded-full opacity-25" style={{ background: th.accent }} />
                {p.badge && (
                  <span className="relative mb-1 self-start rounded-full px-2.5 py-0.5 text-xs font-extrabold" style={{ background: th.accent, color: th.bg }}>
                    {p.badge}
                  </span>
                )}
                <span className="relative text-lg leading-tight font-extrabold">{pick(p.title, lang)}</span>
                {item && (
                  <span className="relative mt-1 text-sm font-semibold opacity-90">
                    {pick(item.name, lang)}
                    {item.promo?.wasPrice != null && item.price != null && (
                      <>
                        {" · "}
                        <s className="opacity-70">{formatFCFA(item.promo.wasPrice)}</s> <b>{formatFCFA(item.price)}</b>
                      </>
                    )}
                  </span>
                )}
                <span className="relative mt-2 text-xs font-bold underline underline-offset-2">{t("offerSee")} →</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Details of one offer, with « Ajouter » for a dish offer. */
export function PromoDetails({ promo, item, lang, t, onAdd, ordering }: { promo: PublicPromo; item?: PublicItem; lang: Lang; t: T; onAdd: () => void; ordering: boolean }) {
  const th = promoTheme(promo.theme);
  const until = promo.endsAt ? new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : lang, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Ouagadougou" }).format(new Date(promo.endsAt)) : null;
  return (
    <div className="flex flex-col gap-3" data-testid="promo-details">
      <div className="relative overflow-hidden rounded-2xl p-5" style={{ background: th.bg, color: th.fg }}>
        {promo.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- owner photo
          <img src={promo.imageUrl} alt="" className="mb-3 max-h-48 w-full rounded-xl object-cover" loading="lazy" />
        )}
        {promo.badge && (
          <span className="mb-2 inline-block rounded-full px-3 py-1 text-sm font-extrabold" style={{ background: th.accent, color: th.bg }}>
            {promo.badge}
          </span>
        )}
        <p className="font-display text-2xl leading-tight font-extrabold">{pick(promo.title, lang)}</p>
        {item && (
          <p className="mt-2 text-lg font-semibold">
            {pick(item.name, lang)}
            {item.price != null && (
              <>
                {" · "}
                {item.promo?.wasPrice != null && <s className="opacity-70">{formatFCFA(item.promo.wasPrice)}</s>} <b>{formatFCFA(item.price)}</b>
              </>
            )}
          </p>
        )}
      </div>
      {promo.body && <p className="whitespace-pre-wrap">{pick(promo.body, lang)}</p>}
      {until && <p className="text-sm font-semibold text-muted-foreground">⏳ {t("offerUntil", { date: until })}</p>}
      {item && ordering && !item.soldOut && (
        <button type="button" onClick={onAdd} className="min-h-12 rounded-xl text-lg font-extrabold" style={{ background: "var(--accent)", color: "var(--on-accent)" }} data-testid="promo-add">
          + {t("offerAdd")}
        </button>
      )}
    </div>
  );
}

/** Free plan: one small RestoCool campaign near the bottom of the menu, marked « Sponsorisé ». */
export function SponsorBanner({ promo, lang, t }: { promo: PublicPromo; lang: Lang; t: T }) {
  useEffect(() => trackPromo(promo.id, "view"), [promo.id]);
  const th = promoTheme(promo.theme);
  const body = (
    <>
      <span className="text-[10px] font-bold tracking-wider uppercase opacity-70">{t("sponsored")}</span>
      <span className="block font-extrabold">{pick(promo.title, lang)}</span>
      {promo.body && <span className="block text-sm opacity-90">{pick(promo.body, lang)}</span>}
      {promo.ctaLabel && <span className="mt-1 inline-block text-sm font-bold underline underline-offset-2">{pick(promo.ctaLabel, lang)} →</span>}
    </>
  );
  const cls = "mx-auto mt-6 block max-w-3xl rounded-2xl p-4 text-left";
  return promo.link ? (
    <a href={promo.link} onClick={() => trackPromo(promo.id, "click")} className={cls} style={{ background: th.bg, color: th.fg }} data-testid="sponsor-banner" {...(promo.link.startsWith("http") ? { target: "_blank", rel: "noopener sponsored" } : {})}>
      {body}
    </a>
  ) : (
    <div className={cls} style={{ background: th.bg, color: th.fg }} data-testid="sponsor-banner">
      {body}
    </div>
  );
}
