import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Provider credentials are encrypted with AES-256-GCM using PAYMENT_ENCRYPTION_KEY (Replit
 * Secrets): 32 bytes as 64 hex characters or base64; any other string is hashed to 32 bytes.
 * Format: iv.tag.ciphertext (base64url). Never log what goes in or out.
 */
export class EncryptionKeyMissingError extends Error {
  constructor() {
    super("PAYMENT_ENCRYPTION_KEY is not set");
  }
}

function key(): Buffer {
  const raw = process.env.PAYMENT_ENCRYPTION_KEY?.trim();
  if (!raw) throw new EncryptionKeyMissingError();
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  const b = Buffer.from(raw, "base64");
  if (b.length === 32) return b;
  return createHash("sha256").update(raw).digest();
}

export const encryptionReady = () => Boolean(process.env.PAYMENT_ENCRYPTION_KEY?.trim());

export function encryptJson(value: Record<string, string>): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decryptJson(sealed: string): Record<string, string> {
  const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  if (!iv || !tag || !data) throw new Error("bad sealed value");
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString("utf8")) as Record<string, string>;
}
