import { ImageResponse } from "next/og";
import { brandIcon, OG_BRAND, OG_SIZE, OgCard } from "@/lib/seo/og";
import fr from "@/messages/fr.json";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "RestoCool";

/** Share card of restocool.com (and of every page without its own). French, like a first visit. */
export default async function Image() {
  return new ImageResponse(
    <OgCard {...OG_BRAND} eyebrow={fr.brand.local} title="RestoCool" subtitle={fr.seo.ogHome} footer="restocool.com" icon={await brandIcon()} />,
    { ...OG_SIZE, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
