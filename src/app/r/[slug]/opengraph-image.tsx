import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { DEFAULT_ACCENT2 } from "@/config/palettes";
import { getDb } from "@/db";
import { findRestaurantBySlug } from "@/db/repos/tenant";
import { textOn } from "@/lib/color";
import { brandIcon, coverForCard, OG_SIZE, OgCard, OgPhotoCard } from "@/lib/seo/og";
import fr from "@/messages/fr.json";

// French texts read directly: image metadata runs outside the next-intl request scope.
const t = (k: keyof typeof fr.seo) => fr.seo[k];

export const size = OG_SIZE;
// JPEG: a photo card as PNG weighs over 1 MB, and WhatsApp skips previews above ~300 KB.
export const contentType = "image/jpeg";

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
  const eyebrow = r.kind === "transport" ? t("ogTransport") : t("ogMenu");
  const [photo, icon] = await Promise.all([coverForCard(r.coverUrl), brandIcon()]);
  // With a photo of the business (its cover): the photo itself, the name over it.
  if (photo) {
    return asJpeg(
      new ImageResponse(
        <OgPhotoCard photo={photo} band={r.settings.accent2 ?? DEFAULT_ACCENT2} eyebrow={eyebrow} title={r.name.slice(0, 60)} subtitle={r.kind === "transport" ? undefined : (r.city ?? undefined)} footer={t("ogFooter")} icon={icon} />,
        OG_SIZE,
      ),
    );
  }
  return asJpeg(new ImageResponse(
    <OgCard
      bg={bg}
      fg={textOn(bg)}
      band={r.settings.accent2 ?? DEFAULT_ACCENT2}
      eyebrow={eyebrow}
      title={r.name.slice(0, 60)}
      subtitle={r.kind === "transport" ? undefined : r.city}
      footer={t("ogFooter")}
      icon={icon}
    />,
    OG_SIZE,
  ));
}

/** The rendered card as a light JPEG (about 100 KB); the PNG as it is if no image library is there. */
async function asJpeg(png: ImageResponse): Promise<Response> {
  const bytes = Buffer.from(await png.arrayBuffer());
  const headers = { "Cache-Control": "public, max-age=3600" };
  try {
    const sharp = (await import("sharp")).default;
    const jpeg = await sharp(bytes).flatten({ background: "#111111" }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    return new Response(new Uint8Array(jpeg), { headers: { ...headers, "Content-Type": "image/jpeg", "Content-Length": String(jpeg.length) } });
  } catch {
    return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": "image/png", "Content-Length": String(bytes.length) } });
  }
}
