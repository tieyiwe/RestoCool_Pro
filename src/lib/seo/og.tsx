import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BRAND } from "@/config/brand";

export const OG_SIZE = { width: 1200, height: 630 };

let icon: Promise<string | null> | null = null;
/** The RestoCool app icon as a data URL (read once from /public; no network fetch). */
export function brandIcon(): Promise<string | null> {
  icon ??= readFile(path.join(process.cwd(), "public/brand/png/app-icon-192.png"))
    .then((b) => `data:image/png;base64,${b.toString("base64")}`)
    .catch(() => null);
  return icon;
}

/**
 * The share card (1200×630): a coloured panel, a big title, a subtitle and the RestoCool footer.
 * Plain flex layout for next/og (Satori); its built-in font, no font download.
 */
export function OgCard(props: { bg: string; fg: string; band: string; eyebrow: string; title: string; subtitle?: string; footer: string; icon: string | null }) {
  const long = props.title.length > 28;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: props.bg, color: props.fg, padding: "64px 72px", position: "relative" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 18, background: props.band, display: "flex" }} />
      <div style={{ display: "flex", fontSize: 30, fontWeight: 700, opacity: 0.85, letterSpacing: 1 }}>{props.eyebrow}</div>
      <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center" }}>
        <div style={{ display: "flex", fontSize: long ? 72 : 96, fontWeight: 800, lineHeight: 1.05 }}>{props.title}</div>
        {props.subtitle ? <div style={{ display: "flex", marginTop: 24, fontSize: 36, opacity: 0.9 }}>{props.subtitle}</div> : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 28, fontWeight: 700 }}>
        {props.icon ? (
          // White badge so the green icon stays visible on a green business colour.
          <div style={{ display: "flex", padding: 5, borderRadius: 18, background: "#FFF8EC" }}>
            <img src={props.icon} width={56} height={56} style={{ borderRadius: 14 }} alt="" />
          </div>
        ) : null}
        <span style={{ display: "flex" }}>{props.footer}</span>
      </div>
    </div>
  );
}

export const OG_BRAND = { bg: BRAND.nuit, fg: BRAND.creme, band: BRAND.or };

/**
 * The business's own photo (its cover: front or room) as a data URL for the share card, or null.
 * Only our own stored media (`/api/media/<key>`); WebP is converted to JPEG (the card renderer
 * reads PNG and JPEG reliably), and every photo is fitted to 1200×630 to keep the card light.
 */
export async function coverForCard(coverUrl: string | null): Promise<string | null> {
  if (!coverUrl?.startsWith("/api/media/")) return null;
  try {
    const { getMediaCached, MEDIA_KEY_RE } = await import("@/lib/storage");
    const key = coverUrl.slice("/api/media/".length);
    if (!MEDIA_KEY_RE.test(key)) return null;
    const bytes = await getMediaCached(key);
    if (!bytes) return null;
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    try {
      const sharp = (await import("sharp")).default;
      const out = await sharp(bytes).resize(1200, 630, { fit: "cover", position: "centre" }).jpeg({ quality: 78 }).toBuffer();
      return `data:image/jpeg;base64,${out.toString("base64")}`;
    } catch {
      // No image library on this machine: PNG and JPEG still work as they are, WebP does not.
      if (isJpeg) return `data:image/jpeg;base64,${bytes.toString("base64")}`;
      if (isPng) return `data:image/png;base64,${bytes.toString("base64")}`;
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * Share card with the business's photo: the photo fills the card, darkened at the bottom so the
 * name stays readable, the business's accent band on the left, RestoCool in the corner.
 */
export function OgPhotoCard(props: { photo: string; band: string; eyebrow: string; title: string; subtitle?: string; footer: string; icon: string | null }) {
  const long = props.title.length > 28;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#111" }}>
      <img src={props.photo} width={1200} height={630} style={{ position: "absolute", left: 0, top: 0, width: 1200, height: 630, objectFit: "cover" }} alt="" />
      <div style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, display: "flex", backgroundImage: "linear-gradient(180deg, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.82) 100%)" }} />
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 18, background: props.band, display: "flex" }} />
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 56, display: "flex", flexDirection: "column", color: "#FFFFFF" }}>
        <div style={{ display: "flex", fontSize: 28, fontWeight: 700, opacity: 0.9, letterSpacing: 1 }}>{props.eyebrow}</div>
        <div style={{ display: "flex", marginTop: 8, fontSize: long ? 68 : 88, fontWeight: 800, lineHeight: 1.05 }}>{props.title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 18, fontSize: 28, fontWeight: 700 }}>
          {props.subtitle ? <span style={{ display: "flex" }}>{props.subtitle} ·</span> : null}
          {props.icon ? <img src={props.icon} width={40} height={40} style={{ borderRadius: 10 }} alt="" /> : null}
          <span style={{ display: "flex" }}>{props.footer}</span>
        </div>
      </div>
    </div>
  );
}
