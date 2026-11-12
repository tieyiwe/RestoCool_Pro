import { getDb } from "@/db";
import { formatRc } from "@/lib/access-codes";
import { allow, tooMany } from "@/lib/public-api";
import { publishedBusinesses } from "@/lib/seo/business";
import { siteBase } from "@/lib/seo/site";

export const dynamic = "force-dynamic";

/** Published businesses as JSON (public facts only: the same as the directory). */
export async function GET(req: Request) {
  if (!allow(req)) return tooMany();
  const base = await siteBase();
  const rows = await publishedBusinesses(getDb());
  return Response.json(
    {
      source: `${base}/restaurants`,
      count: rows.length,
      businesses: rows.map((b) => ({
        name: b.name,
        kind: b.kind,
        city: b.city,
        description: b.description,
        rc: b.rc ? formatRc(b.rc) : null,
        url: `${base}/r/${b.slug}`,
        menu: `${base}/r/${b.slug}/menu.json`,
        updatedAt: b.updatedAt.toISOString(),
      })),
    },
    { headers: { "Cache-Control": "public, max-age=600, s-maxage=600", "Access-Control-Allow-Origin": "*" } },
  );
}
