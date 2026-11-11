"use client";

import { useState } from "react";

export type StickerText = {
  /** « Scannez-moi » and its other-language versions. */
  scanMe: string;
  scanMeAlt: string;
  rcLabel: string;
  /** « Pas de scan ? Allez sur … et tapez le numéro RC. » */
  noScan: string;
  powered: string;
};

/**
 * Downloads a ready-to-print sticker: business name, « Scannez-moi », the QR code (RestoCool icon
 * in the middle) and the numéro RC right under it. Drawn in the browser so the text uses the
 * app's own fonts in every language; the QR image comes from the permission-checked QR route.
 */
export function StickerDownload({
  qrSrc,
  rc,
  name,
  seat,
  filename,
  text,
  label,
  className,
  testId = "sticker-download",
}: {
  qrSrc: string;
  rc: string;
  name: string;
  seat?: string | null;
  filename: string;
  text: StickerText;
  label: string;
  className?: string;
  testId?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(qrSrc, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const qr = await createImageBitmap(await res.blob());
      await document.fonts?.ready;
      const display = resolvedFont("var(--font-display)");
      const sans = resolvedFont("var(--font-sans)");
      const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

      const W = 1200;
      const H = seat ? 1870 : 1770;
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const g = c.getContext("2d")!;
      const round = (x: number, y: number, w: number, h: number, r: number) => {
        g.beginPath();
        g.roundRect(x, y, w, h, r);
      };
      g.fillStyle = "#FFFFFF";
      g.fillRect(0, 0, W, H);
      g.lineWidth = 10;
      g.strokeStyle = "#0F6B3E";
      round(20, 20, W - 40, H - 40, 56);
      g.stroke();
      g.textAlign = "center";
      g.textBaseline = "alphabetic";

      let y = 140;
      g.fillStyle = "#17231C";
      g.font = `800 76px ${display}`;
      g.fillText(fit(g, name, W - 160), W / 2, y);
      if (seat) {
        y += 104;
        g.font = `800 92px ${display}`;
        g.fillText(fit(g, seat, W - 160), W / 2, y);
      }

      // « Scannez-moi » pill.
      y += 70;
      g.font = `800 72px ${sans}`;
      const pillW = Math.min(W - 160, g.measureText(`📷 ${text.scanMe}`).width + 120);
      g.fillStyle = "#17231C";
      round((W - pillW) / 2, y, pillW, 116, 58);
      g.fill();
      g.fillStyle = "#FFFFFF";
      g.fillText(`📷 ${text.scanMe}`, W / 2, y + 82);
      y += 116 + 52;
      g.fillStyle = "#4B5563";
      g.font = `600 40px ${sans}`;
      g.fillText(text.scanMeAlt, W / 2, y);

      // QR code.
      y += 30;
      const size = 900;
      g.imageSmoothingEnabled = false;
      g.drawImage(qr, (W - size) / 2, y, size, size);
      y += size + 40;

      // Numéro RC right under the code.
      g.fillStyle = "#4B5563";
      g.font = `700 40px ${sans}`;
      g.fillText(text.rcLabel.toUpperCase(), W / 2, y + 30);
      g.fillStyle = "#17231C";
      g.font = `800 120px ${mono}`;
      g.fillText(rc, W / 2, y + 160);
      y += 220;

      g.fillStyle = "#4B5563";
      g.font = `500 34px ${sans}`;
      for (const [i, line] of wrap(g, text.noScan, W - 140, 2).entries()) g.fillText(line, W / 2, y + i * 46);
      g.fillStyle = "#0F6B3E";
      g.font = `700 32px ${sans}`;
      g.fillText(text.powered, W / 2, H - 70);

      const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"));
      if (!blob) throw new Error("png");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${filename}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch {
      // Fallback: the plain QR image (always works).
      location.href = qrSrc;
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={download} disabled={busy} className={className} data-testid={testId}>
      {busy ? "…" : label}
    </button>
  );
}

/** Shrinks text with an ellipsis so it never runs off the sticker. */
function fit(g: CanvasRenderingContext2D, s: string, max: number): string {
  if (g.measureText(s).width <= max) return s;
  let out = s;
  while (out.length > 1 && g.measureText(`${out}…`).width > max) out = out.slice(0, -1);
  return `${out}…`;
}

/** The real font names behind a CSS variable (a canvas can't read var()). */
function resolvedFont(cssValue: string): string {
  const el = document.createElement("span");
  el.style.fontFamily = cssValue;
  el.style.position = "absolute";
  el.style.visibility = "hidden";
  document.body.appendChild(el);
  const family = getComputedStyle(el).fontFamily;
  el.remove();
  return family && !family.includes("var(") ? family : "system-ui, sans-serif";
}

/** Splits text into at most `lines` lines that fit the width (the last one is shortened if needed). */
function wrap(g: CanvasRenderingContext2D, s: string, max: number, lines: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const word of s.split(" ")) {
    const next = cur ? `${cur} ${word}` : word;
    if (g.measureText(next).width <= max || !cur) cur = next;
    else {
      out.push(cur);
      cur = word;
    }
  }
  if (cur) out.push(cur);
  if (out.length <= lines) return out;
  return [...out.slice(0, lines - 1), fit(g, out.slice(lines - 1).join(" "), max)];
}
