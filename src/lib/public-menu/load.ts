import "server-only";
import type { DB } from "@/db";
import type { restaurants } from "@/db/schema";
import { tenantRepo } from "@/db/repos/tenant";
import { onAccent } from "@/lib/color";
import type { PublicMenuData } from "./types";

type Restaurant = typeof restaurants.$inferSelect;

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** A category with a time window (e.g. lunch only) is shown only inside it (UTC = Ouagadougou time). */
export function inTimeWindow(w: { from: string; to: string } | null, now: Date): boolean {
  if (!w) return true;
  const m = now.getUTCHours() * 60 + now.getUTCMinutes();
  const f = toMin(w.from);
  const t = toMin(w.to);
  return f <= t ? m >= f && m < t : m >= f || m < t;
}

/** Build the public menu payload: visible categories and dishes only, sold-out state computed now. */
export async function loadPublicMenu(db: DB, r: Restaurant, opts: { preview: boolean; now?: Date }): Promise<PublicMenuData> {
  const now = opts.now ?? new Date();
  const repo = tenantRepo(db, r.id);
  const [categories, items, variants, options, fortunes, hours] = await Promise.all([
    repo.menu.categories(),
    repo.menu.items(),
    repo.menu.variants(),
    repo.menu.options(),
    repo.menu.fortunes(),
    repo.restaurant.openingHours(),
  ]);
  const f = r.settings.features ?? {};
  return {
    slug: r.slug,
    name: r.name,
    description: r.description ?? null,
    city: r.city,
    address: r.address,
    gmapsUrl: r.gmapsUrl,
    phones: r.phones,
    whatsapp: r.whatsapp,
    orangeMoney: r.orangeMoney,
    moovMoney: r.moovMoney,
    logoUrl: r.logoUrl,
    coverUrl: r.coverUrl,
    theme: r.theme,
    accent: r.accentColor,
    onAccent: onAccent(r.theme),
    poweredBadge: r.poweredBadge,
    features: {
      welcomeScreen: f.welcomeScreen ?? true,
      fortuneCookie: (f.fortuneCookie ?? true) && fortunes.length > 0,
      share: f.share ?? true,
      takeawayWhatsapp: (f.takeawayWhatsapp ?? true) && Boolean(r.whatsapp),
      localBadge: f.localBadge ?? false,
    },
    locales: (["fr", "en", "zh"] as const).filter((l) => l === "fr" || (r.settings.enabledLocales ?? ["fr", "en", "zh"]).includes(l)),
    hours: hours.map((h) => ({ weekday: h.weekday, opens: h.opens.slice(0, 5), closes: h.closes.slice(0, 5) })),
    categories: categories
      .filter((c) => c.active && inTimeWindow(c.timeWindow ?? null, now))
      .map((c) => ({
        id: c.id,
        name: c.name,
        items: items
          .filter((i) => i.categoryId === c.id && i.available)
          .map((i) => ({
            id: i.id,
            code: i.code,
            name: i.name,
            description: i.description,
            price: i.price,
            variants: variants.filter((v) => v.itemId === i.id).map((v) => ({ id: v.id, name: v.name, price: v.price })),
            options: options.filter((o) => o.itemId === i.id).map((o) => ({ id: o.id, group: o.group, name: o.name, priceDelta: o.priceDelta })),
            spicy: i.spicy,
            tags: i.tags,
            thumbUrl: i.thumbUrl,
            photoUrl: i.photoUrl,
            soldOut: i.soldOutUntil !== null && i.soldOutUntil.getTime() > now.getTime(),
            soldOutNote: i.soldOutUntil !== null && i.soldOutUntil.getTime() > now.getTime() ? i.unavailableNote : null,
          })),
      }))
      .filter((c) => c.items.length > 0),
    fortunes: fortunes.map((x) => x.text),
    preview: opts.preview,
  };
}
