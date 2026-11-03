/** Limits shared by the browser compressor and the upload API. */
export const IMAGE_LIMITS = {
  fullMaxSide: 1200,
  thumbSide: 168,
  fullMaxBytes: 700 * 1024,
  thumbMaxBytes: 60 * 1024,
} as const;

/** True when the bytes are a WebP file ("RIFF....WEBP"). */
export function isWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
}
