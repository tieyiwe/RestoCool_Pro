"use client";

import { IMAGE_LIMITS } from "./webp";

export type CompressedImage = {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  /** Original file size, for the "data saved" estimate. */
  originalBytes: number;
};

type Mime = "image/webp" | "image/jpeg";

async function toBlob(canvas: HTMLCanvasElement, quality: number, mime: Mime): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b && b.type === mime ? resolve(b) : reject(new Error(`${mime}_unsupported`))), mime, quality),
  );
}

/** WebP where the browser can encode it; JPEG otherwise (Safari on iPhone and Mac). */
let mimeCache: Mime | null = null;
async function bestMime(): Promise<Mime> {
  if (mimeCache) return mimeCache;
  const c = document.createElement("canvas");
  c.width = c.height = 2;
  mimeCache = await toBlob(c, 0.8, "image/webp").then(
    () => "image/webp" as const,
    () => "image/jpeg" as const,
  );
  return mimeCache;
}

/** Encode under a byte budget by lowering quality step by step. */
async function encodeWithin(canvas: HTMLCanvasElement, maxBytes: number, startQuality: number, mime: Mime): Promise<Blob> {
  let q = startQuality;
  let blob = await toBlob(canvas, q, mime);
  while (blob.size > maxBytes && q > 0.4) {
    q -= 0.1;
    blob = await toBlob(canvas, q, mime);
  }
  if (blob.size > maxBytes) throw new Error("too_large");
  return blob;
}

/**
 * Compress a photo in the browser: full image (max 1200px, WebP) + 168px square thumbnail
 * (centre crop). Runs before upload so restaurants on mobile data send little.
 */
export async function compressImage(file: File): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, IMAGE_LIMITS.fullMaxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const full = document.createElement("canvas");
  full.width = width;
  full.height = height;
  full.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);

  const side = Math.min(bitmap.width, bitmap.height);
  const thumb = document.createElement("canvas");
  thumb.width = IMAGE_LIMITS.thumbSide;
  thumb.height = IMAGE_LIMITS.thumbSide;
  thumb
    .getContext("2d")!
    .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, IMAGE_LIMITS.thumbSide, IMAGE_LIMITS.thumbSide);
  bitmap.close();

  const mime = await bestMime();
  return {
    full: await encodeWithin(full, IMAGE_LIMITS.fullMaxBytes, 0.8, mime),
    thumb: await encodeWithin(thumb, IMAGE_LIMITS.thumbMaxBytes, 0.75, mime),
    width,
    height,
    originalBytes: file.size,
  };
}

/** Size for display; the unit label comes from the caller's translations ("{n} Ko" / "{n} KB"). */
export function formatBytes(n: number, units: { kb: (n: string) => string; mb: (n: string) => string }): string {
  return n < 1024 * 1024 ? units.kb(String(Math.round(n / 1024))) : units.mb((n / 1024 / 1024).toFixed(1));
}
