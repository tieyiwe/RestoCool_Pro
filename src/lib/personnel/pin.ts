import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const MAX_PIN_FAILURES = 5;
export const LOCK_MINUTES = 10;
export const Pin = z.string().regex(/^\d{4,6}$/);

/** PINs are never stored: scrypt with a random salt ("scrypt$salt$hash"). */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pin, salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}
export async function verifyPin(pin: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const got = await scrypt(pin, Buffer.from(salt, "base64"), 32);
  const want = Buffer.from(hash, "base64");
  return got.length === want.length && timingSafeEqual(got, want);
}

