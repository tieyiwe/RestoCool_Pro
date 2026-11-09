/** Limits shared by the browser compressor and the upload API. */
export const IMAGE_LIMITS = {
  fullMaxSide: 1200,
  thumbSide: 168,
  fullMaxBytes: 700 * 1024,
  thumbMaxBytes: 60 * 1024,
} as const;

export type ImageFormat = "webp" | "jpg";

/** WebP ("RIFF....WEBP") or JPEG (FF D8 FF). Safari cannot encode WebP, so iPhones upload JPEG. */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (isWebp(bytes)) return "webp";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
}

export const IMAGE_CONTENT_TYPE: Record<ImageFormat, string> = { webp: "image/webp", jpg: "image/jpeg" };

/** True when the bytes are a WebP file ("RIFF....WEBP"). */
export function isWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
}
