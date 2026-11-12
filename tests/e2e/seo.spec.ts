import { expect, test, type APIRequestContext } from "@playwright/test";
import { seatToken, sql } from "./helpers";

/** Search engines get the metadata in <head> (Next streams it later for browsers): ask as a crawler. */
const BOT = { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" };
const html = async (request: APIRequestContext, path: string) => {
  const res = await request.get(path, { headers: BOT });
  return { res, body: await res.text() };
};
const jsonLd = (body: string) =>
  [...body.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1]!) as { "@graph": Array<Record<string, unknown>> });

test("robots.txt opens public pages to every crawler (AI included) and closes private and token paths", async ({ request }) => {
  const res = await request.get("/robots.txt");
  expect(res.status()).toBe(200);
  const txt = await res.text();
  // The super admin console is never listed: robots.txt is public and would reveal its address.
  expect(txt).not.toContain("admin");
  for (const line of ["User-Agent: *", "Allow: /", "Disallow: /app/", "Disallow: /api/", "Disallow: /poste", "Disallow: /pointage", "Disallow: /rejoindre", "Disallow: /sign-in", "Disallow: /sign-up", "Disallow: /r/*/t/", "Disallow: /r/*/b/"])
    expect(txt).toContain(line);
  for (const bot of ["GPTBot", "OAI-SearchBot", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended", "Bingbot"]) expect(txt).toContain(`User-Agent: ${bot}`);
  expect(txt).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
  // « Disallow: /r/ » would hide every menu.
  expect(txt).not.toMatch(/^Disallow: \/r\/$/m);
});

test("the sitemap lists published businesses only, never drafts or token links", async ({ request }) => {
  const res = await request.get("/sitemap.xml");
  expect(res.status()).toBe(200);
  const xml = await res.text();
  for (const p of ["/</loc>", "/restaurants</loc>", "/guide</loc>", "/privacy</loc>", "/r/restaurant-demo</loc>", "/r/shangri-la</loc>", "/r/express-demo</loc>"]) expect(xml).toContain(p);
  expect(xml).toMatch(/<loc>[^<]+\/r\/restaurant-demo<\/loc>\s*<lastmod>/);
  expect(xml).not.toContain("maquis-temoin");
  expect(xml).not.toMatch(/\/r\/[^<]+\/(t|b)\//);
  expect(xml).not.toContain("/app");
});

test("a business page: title, canonical, Open Graph, and Restaurant JSON-LD with its menu", async ({ request }) => {
  const { res, body } = await html(request, "/r/restaurant-demo");
  expect(res.status()).toBe(200);
  expect(body).toMatch(/<title>Restaurant Démo · Menu et prix à Ouagadougou<\/title>/);
  expect(body).toMatch(/<link rel="canonical" href="https?:\/\/[^"]+\/r\/restaurant-demo"\/>/);
  expect(body).toMatch(/<meta property="og:title" content="Restaurant Démo[^"]*"\/>/);
  expect(body).toMatch(/<meta property="og:image" content="https?:\/\/[^"]+\/r\/restaurant-demo\/opengraph-image[^"]*"\/>/);
  expect(body).toContain('<meta name="twitter:card" content="summary_large_image"/>');
  expect(body).not.toMatch(/<meta name="robots" content="noindex/);

  const [ld] = jsonLd(body);
  const biz = ld!["@graph"].find((n) => n["@type"] === "Restaurant") as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- reading JSON-LD
  expect(biz.name).toBe("Restaurant Démo");
  expect(biz.address.addressLocality).toBe("Ouagadougou");
  expect(biz.identifier.value).toMatch(/^RC-[A-Z0-9]{5}$/);
  const items = (biz.hasMenu.hasMenuSection as Array<{ hasMenuItem: Array<{ name: string; offers?: { price: number; priceCurrency: string } | unknown[] }> }>).flatMap((s) => s.hasMenuItem);
  expect(items.length).toBeGreaterThan(20);
  const priced = items.find((i) => i.offers && !Array.isArray(i.offers)) as { offers: { price: number; priceCurrency: string } };
  expect(priced.offers.priceCurrency).toBe("XOF");
  expect(priced.offers.price).toBeGreaterThan(0);
  // « Sur demande »: no price, never 0.
  expect(items.some((i) => i.offers === undefined)).toBe(true);
  expect(ld!["@graph"].some((n) => n["@type"] === "BreadcrumbList")).toBe(true);
  // The menu itself is in the server-rendered HTML (readable without JavaScript).
  expect(body.replace(/<script[\s\S]*?<\/script>/g, "")).toContain("Poulet bicyclette");

  const og = await request.get((body.match(/<meta property="og:image" content="https?:\/\/[^/]+([^"]+)"/) ?? [])[1]!);
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toBe("image/png");
});

test("a bus company is a LocalBusiness; the home page carries Organization, WebSite search, offers and FAQ", async ({ request }) => {
  const bus = jsonLd((await html(request, "/r/express-demo")).body)[0]!;
  expect(bus["@graph"][0]!["@type"]).toBe("LocalBusiness");

  const { body } = await html(request, "/");
  expect(body).toMatch(/<link rel="canonical" href="https?:\/\/[^"]+"\/>/);
  const types = jsonLd(body)[0]!["@graph"].map((n) => n["@type"]);
  expect(types).toEqual(expect.arrayContaining(["Organization", "WebSite", "SoftwareApplication", "FAQPage"]));
  const app = jsonLd(body)[0]!["@graph"].find((n) => n["@type"] === "SoftwareApplication") as { offers: Array<{ price: number; priceCurrency: string }> };
  expect(app.offers.map((o) => o.price)).toEqual([0, 10000, 25000]);
  expect((await request.get("/opengraph-image")).status()).toBe(200);
});

test("private pages, drafts and token links are never indexed", async ({ request }) => {
  for (const path of ["/app", "/poste", "/pointage", "/sign-in"]) {
    const { body } = await html(request, path);
    expect(body, path).toMatch(/<meta name="robots" content="noindex, nofollow"\/>/);
  }
  const token = await seatToken("1");
  const seat = await html(request, `/r/restaurant-demo/t/${token}`);
  expect(seat.body).toMatch(/<meta name="robots" content="noindex, nofollow"\/>/);
  expect(seat.res.headers()["x-robots-tag"]).toContain("noindex");
  expect((await request.get("/api/health")).headers()["x-robots-tag"]).toContain("noindex");
  // The unpublished test tenant does not exist for visitors (and has no share image).
  expect((await request.get("/r/maquis-temoin", { headers: BOT })).status()).toBe(404);
  expect((await request.get("/r/maquis-temoin/menu.json")).status()).toBe(404);
  // Directory searches are followed, not indexed.
  expect((await html(request, "/restaurants?q=ouaga")).body).toMatch(/<meta name="robots" content="noindex, follow"\/>/);
});

test("llms.txt, llms-full.txt and the public JSON describe RestoCool without private data", async ({ request }) => {
  const llms = await request.get("/llms.txt");
  expect(llms.status()).toBe(200);
  expect(llms.headers()["content-type"]).toContain("text/plain");
  const txt = await llms.text();
  expect(txt.startsWith("# RestoCool\n\n> ")).toBe(true);
  expect(txt).toContain("/r/restaurant-demo");
  expect(txt).toContain("10 000 F");
  expect(txt).not.toContain("maquis-temoin");

  const full = await (await request.get("/llms-full.txt")).text();
  expect(full).toContain("## FAQ");
  expect(full).toContain("## Menu: Restaurant Démo");

  const menu = await request.get("/r/restaurant-demo/menu.json");
  expect(menu.status()).toBe(200);
  const data = (await menu.json()) as Record<string, unknown> & { categories: Array<{ items: unknown[] }> };
  expect(data.name).toBe("Restaurant Démo");
  expect(data.categories.flatMap((c) => c.items).length).toBeGreaterThan(20);
  const raw = JSON.stringify(data);
  for (const secret of ["qr_token", "qrToken", "token", "pinHash", "ownerEmail", "settings", "orangeMoney", "restaurantId"]) expect(raw, secret).not.toContain(secret);
  const [r] = await sql<{ id: string }>("select id from restaurants where slug = 'restaurant-demo'");
  expect(raw).not.toContain(r!.id);

  const list = (await (await request.get("/restaurants.json")).json()) as { businesses: Array<{ url: string }> };
  expect(list.businesses.some((b) => b.url.endsWith("/r/shangri-la"))).toBe(true);
  expect(list.businesses.some((b) => b.url.includes("maquis-temoin"))).toBe(false);
});
