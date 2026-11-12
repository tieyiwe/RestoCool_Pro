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
