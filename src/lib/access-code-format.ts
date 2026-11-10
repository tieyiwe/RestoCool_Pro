import { randomInt } from "node:crypto";

/** Pure helpers for the « numéro RC » (no database), usable from scripts too. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTWXYZ23456789";
export const CODE_LENGTH = 5;
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function generateCode(): string {
  let s = "";
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

/** Shown as « Numéro RC » (RC = RestoCool): RC-K7M3P. Stored without the prefix. */
export const RC_PREFIX = "RC";
export const formatRc = (code: string) => `${RC_PREFIX}-${code}`;

/** Uppercases, drops spaces, dashes, dots, « # » and the optional RC prefix. Null if it can't be a code. */
export function normalizeCode(input: string): string | null {
  let s = input.toUpperCase().replace(/[\s\-_.#]/g, "");
  if (s.length === CODE_LENGTH + RC_PREFIX.length && s.startsWith(RC_PREFIX)) s = s.slice(RC_PREFIX.length);
  return CODE_RE.test(s) ? s : null;
}

