import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import QRCode from "qrcode";

/**
 * RestoCool QR codes: the brand icon in the middle. The code uses the highest error correction
 * (« H », up to 30 % of the code can be hidden), and the icon covers only about 22 % of the
 * width (≈ 5 % of the area) on a white rounded backing, so every phone still scans it.
 */
const INK = "#17231C";
const ICON_URL = "/brand/png/app-icon-192.png";
/** Share of the QR width (modules only) taken by the white backing around the icon. */
const BADGE = 0.22;

function modules(text: string) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
  return { size: qr.modules.size, dark: (x: number, y: number) => Boolean(qr.modules.get(y, x)) };
}

/** Odd number of modules for the centre hole, so it sits exactly in the middle. */
function holeModules(size: number) {
  let n = Math.round(size * BADGE);
  if (n % 2 === 0) n += 1;
  return n;
}

/** SVG for screens and print (the icon is loaded from the site, so each card stays small). */
export function brandedQrSvg(text: string, opts: { margin?: number } = {}): string {
  const margin = opts.margin ?? 2;
  const { size, dark } = modules(text);
  const total = size + margin * 2;
  const hole = holeModules(size);
  const h0 = (size - hole) / 2;
  let d = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Leave the centre clean: no half-cut modules under the badge.
      if (x >= h0 && x < h0 + hole && y >= h0 && y < h0 + hole) continue;
      if (dark(x, y)) d += `M${x + margin} ${y + margin}h1v1h-1z`;
    }
  }
  const bx = h0 + margin;
  const pad = hole * 0.1;
  // Same geometry for the same size: a page with many QR codes can share the id safely.
  const clip = `rc-icon-${size}-${margin}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="QR code RestoCool">` +
    `<rect width="${total}" height="${total}" fill="#FFFFFF"/>` +
    `<path fill="${INK}" d="${d}"/>` +
    `<rect x="${bx}" y="${bx}" width="${hole}" height="${hole}" rx="${hole * 0.22}" fill="#FFFFFF"/>` +
    `<clipPath id="${clip}"><rect x="${bx + pad}" y="${bx + pad}" width="${hole - 2 * pad}" height="${hole - 2 * pad}" rx="${(hole - 2 * pad) * 0.22}"/></clipPath>` +
    `<image href="${ICON_URL}" x="${bx + pad}" y="${bx + pad}" width="${hole - 2 * pad}" height="${hole - 2 * pad}" clip-path="url(#${clip})" preserveAspectRatio="xMidYMid slice" shape-rendering="auto"/>` +
    `</svg>`
  );
}

let icon: PNG | null = null;
function brandIcon(): PNG {
  icon ??= PNG.sync.read(readFileSync(path.join(process.cwd(), "public", "brand", "png", "app-icon-512.png")));
  return icon;
}

/** PNG to download and print (1024 px by default), the icon drawn in, no external file needed. */
export function brandedQrPng(text: string, opts: { width?: number; margin?: number } = {}): Buffer {
  const margin = opts.margin ?? 2;
  const { size, dark } = modules(text);
  const total = size + margin * 2;
  const scale = Math.max(4, Math.floor((opts.width ?? 1024) / total));
  const W = total * scale;
  const png = new PNG({ width: W, height: W });
  const ink = [0x17, 0x23, 0x1c];
  const set = (x: number, y: number, rgb: number[], a = 255) => {
    const i = (y * W + x) * 4;
    png.data[i] = rgb[0]!;
    png.data[i + 1] = rgb[1]!;
    png.data[i + 2] = rgb[2]!;
    png.data[i + 3] = a;
  };
  png.data.fill(255);
  const hole = holeModules(size);
  const h0 = (size - hole) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (x >= h0 && x < h0 + hole && y >= h0 && y < h0 + hole) continue;
      if (!dark(x, y)) continue;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) set((x + margin) * scale + dx, (y + margin) * scale + dy, ink);
    }
  }
  // Icon: scaled with box sampling, rounded corners.
  const src = brandIcon();
  const pad = Math.round(hole * 0.1 * scale);
  const ix = Math.round((h0 + margin) * scale) + pad;
  const side = hole * scale - 2 * pad;
  const r = side * 0.22;
  const ratio = src.width / side;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      // Outside the rounded corners: keep the white backing.
      const cx = x < r ? r - x : x > side - 1 - r ? x - (side - 1 - r) : 0;
      const cy = y < r ? r - y : y > side - 1 - r ? y - (side - 1 - r) : 0;
      if (cx * cx + cy * cy > r * r) continue;
      let R = 0, G = 0, B = 0, n = 0;
      const sx0 = Math.floor(x * ratio), sy0 = Math.floor(y * ratio);
      const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * ratio)), sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * ratio));
      for (let sy = sy0; sy < sy1 && sy < src.height; sy++)
        for (let sx = sx0; sx < sx1 && sx < src.width; sx++) {
          const i = (sy * src.width + sx) * 4;
          const a = src.data[i + 3]! / 255;
          R += src.data[i]! * a + 255 * (1 - a);
          G += src.data[i + 1]! * a + 255 * (1 - a);
          B += src.data[i + 2]! * a + 255 * (1 - a);
          n++;
        }
      set(ix + x, ix + y, [Math.round(R / n), Math.round(G / n), Math.round(B / n)]);
    }
  }
  return PNG.sync.write(png);
}
