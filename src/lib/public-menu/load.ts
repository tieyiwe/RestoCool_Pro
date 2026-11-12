import "server-only";
import { DEFAULT_FORTUNES } from "@/config/fortunes";
import { DEFAULT_ACCENT2 } from "@/config/palettes";
import type { DB } from "@/db";
import type { restaurants } from "@/db/schema";
import { tenantRepo } from "@/db/repos/tenant";
import { onAccent, textOn } from "@/lib/color";
import { hasFeature } from "@/lib/plan";
import { liveBusinessPromos, platformPromos } from "@/lib/promotions";
import type { PublicMenuData, PublicPromo } from "./types";

type Restaurant = typeof restaurants.$inferSelect;

const toMin = (hhmm: string) =>
  Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** A category with a time window (e.g. lunch only) is shown only inside it (UTC = Ouagadougou time). */
export function inTimeWindow(
  w: { from: string; to: string } | null,
  now: Date,
): boolean {
  if (!w) return true;
  const m = now.getUTCHours() * 60 + now.getUTCMinutes();
  const f = toMin(w.from);
  const t = toMin(w.to);
  return f <= t ? m >= f && m < t : m >= f || m < t;
}

/** Build the public menu payload: visible categories and dishes only, sold-out state computed now. */
export async function loadPublicMenu(
  db: DB,
  r: Restaurant,
  opts: { preview: boolean; now?: Date },
): Promise<PublicMenuData> {
  const now = opts.now ?? new Date();
  const repo = tenantRepo(db, r.id);
  const free = r.plan === "gratuit";
  const [
    categories,
    items,
    variants,
    options,
    fortunes,
    hours,
    promos,
    sponsors,
  ] = await Promise.all([
    repo.menu.categories(),
    repo.menu.items(),
    repo.menu.variants(),
    repo.menu.options(),
    repo.menu.fortunes(),
    repo.restaurant.openingHours(),
    hasFeature(r, "promotions", now)
      ? liveBusinessPromos(db, r.id)
      : Promise.resolve([]),
    free
      ? platformPromos(db, "free_menu", { city: r.city, kind: r.kind })
      : Promise.resolve([]),
  ]);
  const toPublic = (p: (typeof promos)[number]): PublicPromo => ({
    id: p.id,
    placement: p.placement,
    itemId: p.itemId,
    title: p.title,
    body: p.body ?? null,
    ctaLabel: p.ctaLabel ?? null,
    link: p.link,
    imageUrl: p.imageUrl,
    badge: p.badge,
    promoPrice: p.promoPrice,
    theme: p.theme,
    endsAt: p.endsAt?.toISOString() ?? null,
  });
  const f = r.settings.features ?? {};
  return {
    slug: r.slug,
    name: r.name,
    description: r.description ?? null,
    city: r.city,
    address: r.address,
    gmapsUrl: r.gmapsUrl,
    location:
      r.latitude != null && r.longitude != null
        ? { lat: r.latitude, lng: r.longitude }
        : null,
    phones: r.phones,
    whatsapp: r.whatsapp,
    // The number that receives takeaway orders: the one the owner chose, else the main WhatsApp.
    takeawayWhatsapp: r.settings.takeawayWhatsapp ?? r.whatsapp,
    orangeMoney: r.orangeMoney,
    moovMoney: r.moovMoney,
    logoUrl: r.logoUrl,
    coverUrl: r.coverUrl,
    theme: r.theme,
    accent: r.accentColor,
    onAccent: onAccent(r.theme),
    accent2: r.settings.accent2 ?? DEFAULT_ACCENT2,
    onAccent2: textOn(r.settings.accent2 ?? DEFAULT_ACCENT2),
    poweredBadge: r.poweredBadge,
    features: {
      welcomeScreen: f.welcomeScreen ?? true,
      fortuneCookie: f.fortuneCookie ?? true,
      share: f.share ?? true,
      takeawayWhatsapp:
        (f.takeawayWhatsapp ?? true) &&
        Boolean(r.settings.takeawayWhatsapp ?? r.whatsapp),
      localBadge: f.localBadge ?? false,
    },
    locales: (["fr", "en", "zh"] as const).filter(
      (l) =>
        l === "fr" ||
        (r.settings.enabledLocales ?? ["fr", "en", "zh"]).includes(l),
    ),
    promotions: promos
      .filter(
        (p) =>
          p.placement === "page" ||
          (p.itemId && items.some((i) => i.id === p.itemId && i.available)),
      )
      .map(toPublic),
    sponsor: sponsors[0] ? toPublic(sponsors[0]) : null,
    hours: hours.map((h) => ({
      weekday: h.weekday,
      opens: h.opens.slice(0, 5),
      closes: h.closes.slice(0, 5),
    })),
    categories: categories
      .filter((c) => c.active && inTimeWindow(c.timeWindow ?? null, now))
      .map((c) => ({
        id: c.id,
        name: c.name,
        items: items
          .filter((i) => i.categoryId === c.id && i.available)
          .map((i) => {
            // A running dish offer: its price replaces the usual one (dishes without variants;
            // the server applies the same price to orders).
            const promo = promos.find(
              (p) => p.placement === "item" && p.itemId === i.id,
            );
            const offer =
              promo &&
              promo.promoPrice !== null &&
              variants.every((v) => v.itemId !== i.id)
                ? promo.promoPrice
                : null;
            return {
              id: i.id,
              code: i.code,
              name: i.name,
              description: i.description,
              price: offer ?? i.price,
              ...(promo
                ? {
                    promo: {
                      id: promo.id,
                      badge: promo.badge,
                      wasPrice: offer !== null ? i.price : null,
                    },
                  }
                : {}),
              variants: variants
                .filter((v) => v.itemId === i.id)
                .map((v) => ({ id: v.id, name: v.name, price: v.price })),
              options: options
                .filter((o) => o.itemId === i.id)
                .map((o) => ({
                  id: o.id,
                  group: o.group,
                  name: o.name,
                  priceDelta: o.priceDelta,
                })),
              spicy: i.spicy,
              tags: i.tags,
              thumbUrl: i.thumbUrl,
              photoUrl: i.photoUrl,
              soldOut:
                i.soldOutUntil !== null &&
                i.soldOutUntil.getTime() > now.getTime(),
              soldOutNote:
                i.soldOutUntil !== null &&
                i.soldOutUntil.getTime() > now.getTime()
                  ? i.unavailableNote
                  : null,
            };
          }),
      }))
      .filter((c) => c.items.length > 0),
    // A business that wrote no fortunes yet uses the built-in ones.
    fortunes: fortunes.length ? fortunes.map((x) => x.text) : DEFAULT_FORTUNES,
    preview: opts.preview,
  };
}
