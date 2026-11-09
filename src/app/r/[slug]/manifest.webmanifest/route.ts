import { getDb } from "@/db";
import { findRestaurantBySlug } from "@/db/repos/tenant";
import { BRAND } from "@/config/brand";

export const dynamic = "force-dynamic";

/** Per-restaurant install manifest: "Add to home screen" opens this menu, with its colour. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await findRestaurantBySlug(getDb(), slug);
  if (!r) return new Response("Not found", { status: 404 });
  const icons = r.logoUrl
    ? [{ src: r.logoUrl, sizes: "any", type: "image/webp", purpose: "any" }]
    : [
        { src: "/brand/png/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/brand/png/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      ];
  return Response.json(
    {
      name: r.name,
      short_name: r.name.slice(0, 24),
      description: r.description?.fr ?? `${r.name} · ${r.city}`,
      lang: "fr",
      start_url: `/r/${r.slug}`,
      scope: "/r/",
      display: "standalone",
      background_color: r.theme === "lacquer" ? "#160D0B" : BRAND.creme,
      theme_color: r.accentColor,
      icons,
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
