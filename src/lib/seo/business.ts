import "server-only";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import type { DB } from "@/db";
import { accessCodes, menuItems, restaurants } from "@/db/schema";
import { formatRc } from "@/lib/access-codes";
import type { PublicMenuData } from "@/lib/public-menu/types";
import { formatFCFA } from "@/lib/format";
import { absoluteUrl } from "./json-ld";

/** The business's main « numéro RC » (already printed on its stickers and shown in the directory). Never creates one. */
export async function mainRc(db: DB, restaurantId: string): Promise<string | null> {
  const row = await db.query.accessCodes.findFirst({ where: and(eq(accessCodes.restaurantId, restaurantId), isNull(accessCodes.seatId)) });
  return row ? formatRc(row.code) : null;
}

/** Title and description of a business page, in French (the public menu is French on a new visit). */
export async function businessMeta(r: { name: string; city: string; kind: "restaurant" | "transport"; description: { fr: string } | null }) {
  const t = await getTranslations({ locale: "fr", namespace: "seo" });
  const transport = r.kind === "transport";
  const title = transport ? t("transportTitle", { name: r.name }) : t("menuTitle", { name: r.name, city: r.city });
  const fallback = transport ? t("transportDescription", { name: r.name }) : t("menuDescription", { name: r.name, city: r.city });
  // The owner's slogan or short presentation, with the name and town search results need.
  const own = r.description?.fr?.trim().slice(0, 200);
  const withDot = own && !/[.!?…]$/.test(own) ? `${own}.` : own;
  const description = !withDot ? fallback : transport ? withDot : t("menuDescriptionOwn", { name: r.name, city: r.city, text: withDot });
  return { title, description, labels: { home: t("home"), menu: t("menu") } };
}

/** Every published business, for the sitemap, llms.txt and restaurants.json (public columns only). */
export async function publishedBusinesses(db: DB, limit = 5000) {
  return db
    .select({
      slug: restaurants.slug,
      name: restaurants.name,
      kind: restaurants.kind,
      city: restaurants.city,
      description: restaurants.description,
      // Last change to the business or one of its dishes (sold out, price…), for sitemap lastmod.
      updatedAt: sql<Date>`greatest(${restaurants.updatedAt}, (select max(${menuItems.updatedAt}) from ${menuItems} where ${menuItems.restaurantId} = ${restaurants.id}))`.mapWith(
        (v: string | Date) => new Date(v),
      ),
      rc: accessCodes.code,
    })
    .from(restaurants)
    .leftJoin(accessCodes, and(eq(accessCodes.restaurantId, restaurants.id), sql`${accessCodes.seatId} is null`))
    .where(eq(restaurants.published, true))
    .orderBy(asc(restaurants.featuredRank), desc(restaurants.updatedAt))
    .limit(limit);
}

/**
 * Machine-readable public menu (/r/{slug}/menu.json): only what the public page already shows.
 * No ids, tokens, staff, orders, settings, owner email or payment numbers.
 */
export function publicMenuJson(base: string, menu: PublicMenuData, extra: { kind: "restaurant" | "transport"; rc: string | null; updatedAt: Date }) {
  return {
    name: menu.name,
    kind: extra.kind,
    url: `${base}/r/${menu.slug}`,
    rc: extra.rc,
    description: menu.description,
    city: menu.city,
    address: menu.address,
    location: menu.location,
    mapUrl: menu.gmapsUrl,
    phones: menu.phones.map((p) => `+${p.replace(/\D/g, "")}`),
    whatsapp: menu.whatsapp ? `+${menu.whatsapp.replace(/\D/g, "")}` : null,
    languages: menu.locales,
    currency: "XOF",
    openingHours: menu.hours,
    updatedAt: extra.updatedAt.toISOString(),
    categories: menu.categories.map((c) => ({
      name: c.name,
      items: c.items.map((i) => ({
        code: i.code,
        name: i.name,
        description: i.description,
        price: i.price,
        priceText: formatFCFA(i.price),
        onRequest: i.price == null && i.variants.length === 0,
        variants: i.variants.map((v) => ({ name: v.name, price: v.price })),
        options: i.options.map((o) => ({ group: o.group, name: o.name, priceDelta: o.priceDelta })),
        spicy: i.spicy,
        tags: i.tags,
        soldOut: i.soldOut,
        photo: absoluteUrl(base, i.photoUrl) ?? null,
      })),
    })),
  };
}
