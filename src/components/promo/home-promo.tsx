"use client";

import { useEffect } from "react";
import { promoTheme } from "@/config/promo-themes";
import { trackPromo } from "./track";

export type HomePromoData = { id: string; title: string; body: string | null; cta: string | null; link: string | null; badge: string | null; imageUrl: string | null; theme: string };

/** A RestoCool campaign on the home page or directory: big card (« hero ») or thin top strip. */
export function HomePromo({ p, variant }: { p: HomePromoData; variant: "hero" | "strip" }) {
  useEffect(() => trackPromo(p.id, "view"), [p.id]);
  const th = promoTheme(p.theme);
  const ext = p.link?.startsWith("http");
  const Tag = p.link ? "a" : "div";
  const linkProps = p.link ? { href: p.link, onClick: () => trackPromo(p.id, "click"), ...(ext ? { target: "_blank", rel: "noopener sponsored" } : {}) } : {};
  if (variant === "strip")
    return (
      <Tag {...linkProps} className="block px-4 py-2 text-center text-sm font-semibold" style={{ background: th.bg, color: th.fg }} data-testid="promo-home-strip">
        {p.badge && (
          <span className="mr-2 rounded-full px-2 py-0.5 text-xs font-extrabold" style={{ background: th.accent, color: th.bg }}>
            {p.badge}
          </span>
        )}
        {p.title}
        {p.cta && <span className="ml-2 underline underline-offset-2">{p.cta} →</span>}
      </Tag>
    );
  return (
    <section className="mx-auto max-w-6xl px-4 py-6" data-testid="promo-home-hero">
      <Tag {...linkProps} className="relative flex flex-col gap-4 overflow-hidden rounded-3xl p-6 shadow-lg sm:flex-row sm:items-center sm:p-8" style={{ background: th.bg, color: th.fg }}>
        <span aria-hidden className="pointer-events-none absolute -top-10 -right-10 size-48 rounded-full opacity-20" style={{ background: th.accent }} />
        {p.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- campaign picture
          <img src={p.imageUrl} alt="" loading="lazy" className="relative h-40 w-full rounded-2xl object-cover sm:h-36 sm:w-56" />
        )}
        <div className="relative flex-1">
          {p.badge && (
            <span className="mb-2 inline-block rounded-full px-3 py-1 text-xs font-extrabold" style={{ background: th.accent, color: th.bg }}>
              {p.badge}
            </span>
          )}
          <p className="font-display text-2xl leading-tight font-extrabold sm:text-3xl">{p.title}</p>
          {p.body && <p className="mt-2 max-w-2xl opacity-90">{p.body}</p>}
        </div>
        {p.cta && (
          <span className="relative inline-flex min-h-12 items-center justify-center self-start rounded-xl px-5 font-bold sm:self-center" style={{ background: th.accent, color: th.bg }}>
            {p.cta} →
          </span>
        )}
      </Tag>
    </section>
  );
}
