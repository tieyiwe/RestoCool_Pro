import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { PLANS } from "@/config/plans";
import { absoluteUrl, businessJsonLd, e164, openingHoursSpec, priceRange, serializeJsonLd, siteJsonLd, type JsonLd } from "@/lib/seo/json-ld";
import { llmsTxt } from "@/lib/seo/llms";
import { ALLOW, DISALLOW, KNOWN_CRAWLERS } from "@/lib/seo/robots-rules";
import type { PublicItem, PublicMenuData } from "@/lib/public-menu/types";

const item = (over: Partial<PublicItem>): PublicItem => ({
  id: "i1",
  code: "10",
  name: { fr: "Poulet bicyclette", en: "Free-range chicken", zh: "走地鸡" },
  description: { fr: "Grillé au feu de bois" },
  price: 2000,
  variants: [],
  options: [],
  spicy: 0,
  tags: [],
  thumbUrl: "/api/media/t.webp",
  photoUrl: "/api/media/p.webp",
  soldOut: false,
  soldOutNote: null,
  ...over,
});

const menu = (over: Partial<PublicMenuData> = {}): PublicMenuData => ({
  slug: "chez-awa",
  name: "Chez Awa",
  description: { fr: "Grillades et jus maison." },
  city: "Ouagadougou",
  address: "Avenue Kwame Nkrumah",
  gmapsUrl: null,
  location: { lat: 12.37, lng: -1.52 },
  phones: ["22670000001"],
  whatsapp: "22670000001",
  takeawayWhatsapp: null,
  orangeMoney: "22670000002",
  moovMoney: null,
  logoUrl: "/api/media/logo.webp",
  coverUrl: null,
  theme: "warm",
  accent: "#0F6B3E",
  onAccent: "#FFFFFF",
  accent2: "#E9B530",
  onAccent2: "#17231C",
  poweredBadge: true,
  features: { welcomeScreen: true, fortuneCookie: true, share: true, takeawayWhatsapp: true, localBadge: false },
  locales: ["fr", "en", "zh"],
  hours: [{ weekday: 0, opens: "11:00", closes: "23:00" }],
  categories: [
    {
      id: "c1",
      name: { fr: "Grillades", en: "Grills" },
      items: [
        item({}),
        item({ id: "i2", code: null, name: { fr: "Champagne" }, price: null, variants: [{ id: "v1", name: { fr: "75 cl" }, price: 48000 }, { id: "v2", name: { fr: "Magnum" }, price: 78000 }] }),
        item({ id: "i3", code: "12", name: { fr: "Langouste" }, price: null, photoUrl: null, thumbUrl: null }),
      ],
    },
  ],
  fortunes: [],
  preview: false,
  ...over,
});

const labels = { home: "Accueil", directory: "Établissements sur RestoCool", menu: "Menu" };
const BASE = "https://restocool.com";
type Node = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- test helper reading JSON-LD

const graph = (d: JsonLd) => d["@graph"] as [Node, Node, Node, Node];

describe("serializeJsonLd", () => {
  it("cannot close the script element, and parses back to the same data", () => {
    const data = { name: "</script><script>alert(1)</script> & <!--  " };
    const out = serializeJsonLd(data);
    expect(out).not.toMatch(/<|>/);
    expect(out).not.toContain("&");
    expect(out).not.toContain(" ");
    expect(JSON.parse(out)).toEqual(data);
  });
});

describe("small helpers", () => {
  it("absoluteUrl, e164, priceRange, opening hours", () => {
    expect(absoluteUrl(BASE, "/api/media/x.webp")).toBe(`${BASE}/api/media/x.webp`);
    expect(absoluteUrl(BASE, "https://cdn.example/x.png")).toBe("https://cdn.example/x.png");
    expect(absoluteUrl(BASE, null)).toBeUndefined();
    expect(e164("22670000001")).toBe("+22670000001");
    expect(e164("12")).toBeUndefined();
    expect(priceRange(menu())).toBe("2 000 F – 78 000 F");
    expect(priceRange(menu({ categories: [] }))).toBeUndefined();
    expect(openingHoursSpec([{ weekday: 6, opens: "10:00", closes: "02:00" }])[0]).toMatchObject({ dayOfWeek: "https://schema.org/Saturday", opens: "10:00", closes: "02:00" });
  });
});

describe("businessJsonLd", () => {
  it("describes a restaurant with its menu, prices in XOF and no invented facts", () => {
    const d = businessJsonLd({ base: BASE, kind: "restaurant", rc: "RC-K7M3P", menu: menu(), labels });
    const [biz, crumbs] = graph(d);
    expect(d["@context"]).toBe("https://schema.org");
    expect(biz["@type"]).toBe("Restaurant");
    expect(biz.url).toBe(`${BASE}/r/chez-awa`);
    expect(biz.telephone).toBe("+22670000001");
    expect(biz.address).toMatchObject({ addressLocality: "Ouagadougou", addressCountry: "BF", streetAddress: "Avenue Kwame Nkrumah" });
    expect(biz.geo).toMatchObject({ latitude: 12.37, longitude: -1.52 });
    expect(biz.identifier.value).toBe("RC-K7M3P");
    expect(biz.acceptsReservations).toBe(false);
    // Honesty: no ratings, reviews or cuisine we were not told about.
    expect(biz.aggregateRating).toBeUndefined();
    expect(biz.review).toBeUndefined();
    expect(biz.servesCuisine).toBeUndefined();
    const section = biz.hasMenu.hasMenuSection[0];
    expect(biz.hasMenu.inLanguage).toEqual(["fr", "en", "zh"]);
    expect(section).toMatchObject({ "@type": "MenuSection", name: "Grillades", alternateName: ["Grills"] });
    const [chicken, champagne, onRequest] = section.hasMenuItem;
    expect(chicken).toMatchObject({ name: "10. Poulet bicyclette", alternateName: ["Free-range chicken", "走地鸡"], image: `${BASE}/api/media/p.webp` });
    expect(chicken.offers).toMatchObject({ price: 2000, priceCurrency: "XOF" });
    expect(champagne.offers).toHaveLength(2);
    expect(champagne.offers[1]).toMatchObject({ name: "Magnum", price: 78000 });
    // « Sur demande »: no price at all (never 0).
    expect(onRequest.offers).toBeUndefined();
    expect(crumbs["@type"]).toBe("BreadcrumbList");
    expect(crumbs.itemListElement.map((x: Node) => x.item)).toEqual([`${BASE}/`, `${BASE}/restaurants`, `${BASE}/r/chez-awa`]);
  });

  it("leaves out what the owner did not give, and the country outside the Burkina town list", () => {
    const biz = graph(businessJsonLd({ base: BASE, kind: "restaurant", rc: null, menu: menu({ phones: [], location: null, hours: [], city: "Abidjan", address: null }), labels }))[0];
    expect(biz.telephone).toBeUndefined();
    expect(biz.geo).toBeUndefined();
    expect(biz.openingHoursSpecification).toBeUndefined();
    expect(biz.identifier).toBeUndefined();
    expect(biz.address).toEqual({ "@type": "PostalAddress", addressLocality: "Abidjan" });
  });

  it("a bus company is a LocalBusiness with its on-board menu as a catalog", () => {
    const biz = graph(businessJsonLd({ base: BASE, kind: "transport", rc: null, menu: menu(), labels }))[0];
    expect(biz["@type"]).toBe("LocalBusiness");
    expect(biz.hasMenu).toBeUndefined();
    expect(biz.hasOfferCatalog.itemListElement[0].itemListElement[0]).toMatchObject({ price: 2000, priceCurrency: "XOF" });
  });

  it("user text stays inside the script once serialized", () => {
    const d = businessJsonLd({ base: BASE, kind: "restaurant", rc: null, menu: menu({ name: "Bar </script><img src=x onerror=alert(1)>" }), labels });
    const out = serializeJsonLd(d);
    expect(out).not.toContain("</script>");
    expect(graph(JSON.parse(out))[0].name).toBe("Bar </script><img src=x onerror=alert(1)>");
  });
});

describe("siteJsonLd", () => {
  it("organization, website search, software offers in XOF and the visible FAQ", () => {
    const d = siteJsonLd({
      base: BASE,
      description: "Menu digital",
      slogan: "Simple.",
      languages: ["fr", "en", "zh"],
      plans: (["gratuit", "pro", "business"] as const).map((id) => ({ id, name: id, description: id, price: PLANS[id].priceMonthly })),
      faq: [{ q: "Q ?", a: "R." }],
    });
    const types = graph(d).map((n) => n["@type"]);
    expect(types).toEqual(["Organization", "WebSite", "SoftwareApplication", "FAQPage"]);
    const site = graph(d)[1];
    expect(site.potentialAction.target.urlTemplate).toBe(`${BASE}/restaurants?q={search_term_string}`);
    const offers = graph(d)[2].offers as Node[];
    expect(offers.map((o) => o.price)).toEqual([0, 10000, 25000]);
    expect(offers.every((o) => o.priceCurrency === "XOF")).toBe(true);
    expect(graph(siteJsonLd({ base: BASE, description: "", slogan: "", languages: [], plans: [], faq: [] })).map((n) => n["@type"])).not.toContain("FAQPage");
  });
});

describe("robots rules", () => {
  it("close private areas and token links, keep dish photos and AI crawlers", () => {
    for (const p of ["/app/", "/api/", "/poste", "/pointage", "/rejoindre", "/sign-in", "/sign-up", "/r/*/t/", "/r/*/b/"]) expect(DISALLOW).toContain(p);
    // « /app » alone would also block /apple-icon.png.
    expect(DISALLOW).not.toContain("/app");
    expect(ALLOW).toContain("/api/media/");
    for (const bot of ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "Claude-SearchBot", "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended", "Bingbot"])
      expect(KNOWN_CRAWLERS).toContain(bot);
  });
});

describe("llmsTxt", () => {
  const businesses = [{ slug: "chez-awa", name: "Chez [Awa]", kind: "restaurant" as const, city: "Ouagadougou", description: { fr: "Grillades." }, rc: "K7M3P" }];
  it("summary, pricing from the plan config and the published businesses", () => {
    const out = llmsTxt(BASE, businesses);
    expect(out.startsWith("# RestoCool\n\n> ")).toBe(true);
    expect(out).toContain("10 000 F");
    expect(out).toContain("25 000 F");
    expect(out).toContain(`${BASE}/r/chez-awa`);
    expect(out).toContain(`${BASE}/r/chez-awa/menu.json`);
    expect(out).toContain("RC-K7M3P");
    expect(out).toContain("Chez \\[Awa\\]");
    expect(out).not.toContain("## FAQ");
  });
  it("full version adds the FAQ and the menus", () => {
    const out = llmsTxt(BASE, businesses, { full: true, menus: new Map([["chez-awa", menu()]]) });
    expect(out).toContain("## FAQ");
    expect(out).toContain("## Menu: Chez \\[Awa\\]");
    expect(out).toContain("10. Poulet bicyclette (Free-range chicken · 走地鸡): 2 000 F");
    expect(out).toContain("12. Langouste: sur demande");
    expect(out).toContain("Magnum 78 000 F");
  });
});
