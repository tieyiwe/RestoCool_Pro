/**
 * Structured data (schema.org JSON-LD) for search engines and AI assistants.
 * Pure functions (no database, no request): unit-tested in tests/unit/seo.test.ts.
 * Honesty rule (CLAUDE.md §1): only facts the business or the platform really has. No ratings,
 * no reviews, no cuisine we were not told about, no hosting or office claims.
 */
import { BF_CITIES } from "@/config/cities";
import { formatFCFA, NNBSP } from "@/lib/format";

/** « 5 300 F » with plain spaces: machine-read text (JSON-LD, llms.txt) need no typographic spaces. */
export const plainFCFA = (n: number | null | undefined): string | null => formatFCFA(n)?.split(NNBSP).join(" ") ?? null;
import type { PublicMenuData } from "@/lib/public-menu/types";

export type JsonLd = Record<string, unknown>;

/**
 * JSON for a <script type="application/ld+json">. Business names, dishes and descriptions are
 * typed by owners, so « </script> », « <!-- » and line separators are escaped: the browser can
 * never leave the script element, and JSON parsers read the same text back.
 */
export function serializeJsonLd(data: JsonLd | JsonLd[]): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** "/api/media/x.webp" → "https://restocool.com/api/media/x.webp"; absolute URLs stay as they are. */
export function absoluteUrl(base: string, path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Stored phones are digits with the country code ("22670000001") → "+22670000001". */
export function e164(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  const d = phone.replace(/\D/g, "");
  return d.length >= 8 ? `+${d}` : undefined;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Drop undefined/null/empty values so the JSON stays small and valid. */
function compact<T extends JsonLd>(o: T): T {
  const out: JsonLd = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as T;
}

type Text = { fr: string } & Partial<Record<string, string>>;
/** Other-language names (EN, ZH) as alternateName, when the owner typed them. */
const alternates = (t: Text | null | undefined): string[] | undefined => {
  if (!t) return undefined;
  const alt = [t.en, t.zh].map((x) => x?.trim()).filter((x): x is string => Boolean(x) && x !== t.fr);
  return alt.length ? alt : undefined;
};

export type BusinessInput = {
  base: string;
  kind: "restaurant" | "transport";
  /** Main « numéro RC » (printed on the business's stickers), e.g. "RC-K7M3P". */
  rc: string | null;
  menu: PublicMenuData;
  /** Translated labels (French: the public menu is French on a new visit). */
  labels: { home: string; directory: string; menu: string };
};

/** Lowest–highest dish price, « 500 F – 25 000 F » style, or undefined when nothing has a price. */
export function priceRange(menu: PublicMenuData): string | undefined {
  const prices: number[] = [];
  for (const c of menu.categories)
    for (const i of c.items) {
      if (i.price != null && i.price > 0) prices.push(i.price);
      for (const v of i.variants) if (v.price > 0) prices.push(v.price);
    }
  if (!prices.length) return undefined;
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const f = (n: number) => plainFCFA(n) ?? "";
  return lo === hi ? f(lo) : `${f(lo)} – ${f(hi)}`;
}

/** schema.org Offer(s) for a dish: one per variant, one for a priced dish, none for « sur demande ». */
function itemOffers(item: PublicMenuData["categories"][number]["items"][number]): JsonLd | JsonLd[] | undefined {
  const availability = item.soldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock";
  if (item.variants.length)
    return item.variants.map((v) => ({ "@type": "Offer", name: v.name.fr, price: v.price, priceCurrency: "XOF", availability }));
  if (item.price == null) return undefined;
  return { "@type": "Offer", price: item.price, priceCurrency: "XOF", availability };
}

function menuSections(menu: PublicMenuData, base: string): JsonLd[] {
  return menu.categories.map((c) =>
    compact({
      "@type": "MenuSection",
      name: c.name.fr,
      alternateName: alternates(c.name),
      hasMenuItem: c.items.map((i) =>
        compact({
          "@type": "MenuItem",
          name: i.code ? `${i.code}. ${i.name.fr}` : i.name.fr,
          alternateName: alternates(i.name),
          description: i.description?.fr?.trim() || undefined,
          image: absoluteUrl(base, i.photoUrl ?? i.thumbUrl),
          offers: itemOffers(i),
        }),
      ),
    }),
  );
}

/** Opening hours → OpeningHoursSpecification (weekday 0 = Sunday). */
export function openingHoursSpec(hours: PublicMenuData["hours"]): JsonLd[] {
  return hours.map((h) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: `https://schema.org/${DAYS[h.weekday] ?? "Monday"}`, opens: h.opens, closes: h.closes }));
}

/**
 * The business page's JSON-LD graph: the business (Restaurant, or LocalBusiness for a bus company
 * serving food on board), its menu, and the breadcrumb Home › Directory › Business.
 */
export function businessJsonLd(input: BusinessInput): JsonLd {
  const { base, menu, kind } = input;
  const url = `${base}/r/${menu.slug}`;
  const inBurkina = BF_CITIES.includes(menu.city);
  const address = compact({
    "@type": "PostalAddress",
    streetAddress: menu.address ?? undefined,
    addressLocality: menu.city || undefined,
    // Only towns of Burkina Faso from the city list: « Autre ville… » may be anywhere.
    addressCountry: inBurkina ? "BF" : undefined,
  });
  const languages = menu.locales;
  const menuNode = compact({
    "@type": "Menu",
    "@id": `${url}#menu`,
    name: input.labels.menu,
    url,
    inLanguage: languages,
    hasMenuSection: menuSections(menu, base),
  });
  const images = [absoluteUrl(base, menu.coverUrl), absoluteUrl(base, menu.logoUrl)].filter((x): x is string => Boolean(x));
  const business = compact({
    "@type": kind === "transport" ? "LocalBusiness" : "Restaurant",
    "@id": `${url}#business`,
    name: menu.name,
    description: menu.description?.fr?.trim() || undefined,
    url,
    image: images.length ? images : undefined,
    logo: absoluteUrl(base, menu.logoUrl),
    telephone: e164(menu.phones[0]),
    address: Object.keys(address).length > 1 ? address : undefined,
    geo: menu.location ? { "@type": "GeoCoordinates", latitude: menu.location.lat, longitude: menu.location.lng } : undefined,
    hasMap: menu.gmapsUrl ?? undefined,
    identifier: input.rc ? { "@type": "PropertyValue", propertyID: "RestoCool RC", value: input.rc } : undefined,
    currenciesAccepted: "XOF",
    priceRange: priceRange(menu),
    openingHoursSpecification: menu.hours.length ? openingHoursSpec(menu.hours) : undefined,
    knowsLanguage: languages,
    // Reservations are not offered on RestoCool yet (M6).
    ...(kind === "transport"
      ? {
          // hasMenu is a FoodEstablishment property: a bus company lists its on-board menu as a catalog.
          hasOfferCatalog: compact({
            "@type": "OfferCatalog",
            name: input.labels.menu,
            itemListElement: menu.categories.map((c) => ({
              "@type": "OfferCatalog",
              name: c.name.fr,
              itemListElement: c.items.map((i) =>
                compact({ "@type": "Offer", itemOffered: { "@type": "Product", name: i.name.fr }, price: i.price ?? undefined, priceCurrency: i.price != null ? "XOF" : undefined }),
              ),
            })),
          }),
        }
      : { acceptsReservations: input.menu.features.reservations, hasMenu: menuNode }),
  });
  const breadcrumb = breadcrumbJsonLd([
    { name: input.labels.home, url: `${base}/` },
    { name: input.labels.directory, url: `${base}/restaurants` },
    { name: menu.name, url },
  ]);
  return { "@context": "https://schema.org", "@graph": [business, breadcrumb] };
}

export function breadcrumbJsonLd(items: Array<{ name: string; url: string }>): JsonLd {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
  };
}

export type PlanOffer = { id: string; name: string; description: string; price: number };

export type SiteInput = {
  base: string;
  description: string;
  slogan: string;
  plans: PlanOffer[];
  faq: Array<{ q: string; a: string }>;
  /** Languages the platform speaks (BCP 47). */
  languages: string[];
};

/**
 * The home page graph: the RestoCool organization (a TIBLOGICS product), the website with its
 * directory search, the software with its plans in FCFA, and the FAQ shown on the page.
 */
export function siteJsonLd(input: SiteInput): JsonLd {
  const { base } = input;
  const org = {
    "@type": "Organization",
    "@id": `${base}/#organization`,
    name: "RestoCool",
    url: `${base}/`,
    logo: `${base}/brand/png/app-icon-512.png`,
    slogan: input.slogan,
    parentOrganization: { "@type": "Organization", name: "TIBLOGICS", url: "https://tiblogics.com" },
    areaServed: { "@type": "Country", name: "Burkina Faso" },
  };
  const website = {
    "@type": "WebSite",
    "@id": `${base}/#website`,
    name: "RestoCool",
    url: `${base}/`,
    inLanguage: input.languages,
    publisher: { "@id": `${base}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${base}/restaurants?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
  const app = {
    "@type": "SoftwareApplication",
    "@id": `${base}/#software`,
    name: "RestoCool",
    url: `${base}/`,
    description: input.description,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    inLanguage: input.languages,
    publisher: { "@id": `${base}/#organization` },
    offers: input.plans.map((p) => ({
      "@type": "Offer",
      name: p.name,
      description: p.description,
      price: p.price,
      priceCurrency: "XOF",
      url: `${base}/#pricing`,
      ...(p.price > 0
        ? { priceSpecification: { "@type": "UnitPriceSpecification", price: p.price, priceCurrency: "XOF", unitCode: "MON", referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitCode: "MON" } } }
        : {}),
    })),
  };
  const graph: JsonLd[] = [org, website, app];
  if (input.faq.length)
    graph.push({
      "@type": "FAQPage",
      "@id": `${base}/#faq`,
      mainEntity: input.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    });
  return { "@context": "https://schema.org", "@graph": graph };
}

/** The directory page: a list of the businesses shown. */
export function directoryJsonLd(base: string, name: string, entries: Array<{ name: string; slug: string }>, labels: { home: string }): JsonLd {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name,
        url: `${base}/restaurants`,
        mainEntity: {
          "@type": "ItemList",
          itemListElement: entries.map((e, i) => ({ "@type": "ListItem", position: i + 1, name: e.name, url: `${base}/r/${e.slug}` })),
        },
      },
      breadcrumbJsonLd([
        { name: labels.home, url: `${base}/` },
        { name, url: `${base}/restaurants` },
      ]),
    ],
  };
}
