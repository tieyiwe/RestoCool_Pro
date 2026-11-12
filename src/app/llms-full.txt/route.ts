import { getDb } from "@/db";
import { findRestaurantBySlug } from "@/db/repos/tenant";
import { allow, tooMany } from "@/lib/public-api";
import { loadPublicMenu } from "@/lib/public-menu/load";
import type { PublicMenuData } from "@/lib/public-menu/types";
import { publishedBusinesses } from "@/lib/seo/business";
import { llmsTxt } from "@/lib/seo/llms";
import { siteBase } from "@/lib/seo/site";

export const dynamic = "force-dynamic";

/** Full menus are inlined for the first businesses; the others are linked (/r/{slug}/menu.json). */
const MAX_MENUS = 30;

/** /llms-full.txt: llms.txt plus the FAQ (EN + FR) and the menus of published businesses. */
export async function GET(req: Request) {
  if (!allow(req)) return tooMany();
  const base = await siteBase();
  const db = getDb();
  const businesses = await publishedBusinesses(db, 500).catch(() => []);
  const menus = new Map<string, PublicMenuData>();
  await Promise.all(
    businesses.slice(0, MAX_MENUS).map(async (b) => {
      const r = await findRestaurantBySlug(db, b.slug);
      if (r) menus.set(b.slug, await loadPublicMenu(db, r, { preview: false }));
    }),
  ).catch(() => undefined);
  return new Response(llmsTxt(base, businesses, { full: true, menus }), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}
