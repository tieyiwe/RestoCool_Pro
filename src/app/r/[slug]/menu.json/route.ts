import { getDb } from "@/db";
import { findRestaurantBySlug } from "@/db/repos/tenant";
import { allow, notFound, Slug, tooMany } from "@/lib/public-api";
import { loadPublicMenu } from "@/lib/public-menu/load";
import { mainRc, publicMenuJson } from "@/lib/seo/business";
import { siteBase } from "@/lib/seo/site";

export const dynamic = "force-dynamic";

/**
 * A published business's menu as JSON, for AI assistants, search tools and integrations: the same
 * facts as the public page (dishes, prices in FCFA, hours, contacts), nothing private. Drafts → 404.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!Slug.safeParse(slug).success) return notFound();
  if (!allow(req)) return tooMany();
  const db = getDb();
  const r = await findRestaurantBySlug(db, slug);
  if (!r) return notFound();
  const [base, rc, menu] = await Promise.all([siteBase(), mainRc(db, r.id), loadPublicMenu(db, r, { preview: false })]);
  return Response.json(publicMenuJson(base, menu, { kind: r.kind, rc, updatedAt: r.updatedAt }), {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600",
      "Access-Control-Allow-Origin": "*",
      Link: `<${base}/r/${r.slug}>; rel="canonical"`,
    },
  });
}
