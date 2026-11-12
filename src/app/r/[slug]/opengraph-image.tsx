import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { DEFAULT_ACCENT2 } from "@/config/palettes";
import { getDb } from "@/db";
import { findRestaurantBySlug } from "@/db/repos/tenant";
import { textOn } from "@/lib/color";
import { brandIcon, OG_SIZE, OgCard } from "@/lib/seo/og";
import fr from "@/messages/fr.json";

// French texts read directly: image metadata runs outside the next-intl request scope.
const t = (k: keyof typeof fr.seo) => fr.seo[k];

export const size = OG_SIZE;
export const contentType = "image/png";

/** One image per business (its name in the alt text). Published businesses only. */
export async function generateImageMetadata({ params }: { params: { slug: string } }) {
  const r = await findRestaurantBySlug(getDb(), params.slug).catch(() => null);
  if (!r) return [];
  return [{ id: "card", alt: `${r.name} · ${r.kind === "transport" ? t("ogTransport") : t("ogMenu")}`, size: OG_SIZE, contentType }];
}

/** Share card of a business menu (WhatsApp, Facebook, search results): its colours, name and town. */
export default async function Image({ params }: { params: { slug: string } }) {
  const r = await findRestaurantBySlug(getDb(), params.slug);
  if (!r) notFound();
  const bg = r.theme === "lacquer" ? "#160D0B" : r.accentColor;
  return new ImageResponse(
    <OgCard
      bg={bg}
      fg={textOn(bg)}
      band={r.settings.accent2 ?? DEFAULT_ACCENT2}
      eyebrow={r.kind === "transport" ? t("ogTransport") : t("ogMenu")}
      title={r.name.slice(0, 60)}
      subtitle={r.kind === "transport" ? undefined : r.city}
      footer={t("ogFooter")}
      icon={await brandIcon()}
    />,
    { ...OG_SIZE, headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
