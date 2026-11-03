import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** URL-safe random token. Default 18 bytes = 144 bits (>= 128 bits as required). */
export function randomToken(bytes = 18): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
