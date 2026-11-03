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

async function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b && b.type === "image/webp" ? resolve(b) : reject(new Error("webp_unsupported"))), "image/webp", quality),
  );
}

/** Encode under a byte budget by lowering quality step by step. */
async function encodeWithin(canvas: HTMLCanvasElement, maxBytes: number, startQuality: number): Promise<Blob> {
  let q = startQuality;
  let blob = await toBlob(canvas, q);
  while (blob.size > maxBytes && q > 0.4) {
    q -= 0.1;
    blob = await toBlob(canvas, q);
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

  return {
    full: await encodeWithin(full, IMAGE_LIMITS.fullMaxBytes, 0.8),
    thumb: await encodeWithin(thumb, IMAGE_LIMITS.thumbMaxBytes, 0.75),
    width,
    height,
    originalBytes: file.size,
  };
}

export function formatBytes(n: number): string {
  return n < 1024 * 1024 ? `${Math.round(n / 1024)} Ko` : `${(n / 1024 / 1024).toFixed(1)} Mo`;
}
