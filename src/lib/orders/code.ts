import { slugify } from "@/lib/slug";

/** Small words that don't make initials (« Chez », « Le », « de »…). */
const STOP = new Set(["le", "la", "les", "l", "de", "du", "des", "d", "et", "chez", "au", "aux", "a", "the"]);

/**
 * Initials of a business for its order numbers: « Shangri-La » → SL, « Restaurant Démo » → RD,
 * « Maquis Le Baobab » → MB; a single word gives its first two letters (« Karité » → KA).
 */
export function businessInitials(name: string): string {
  // Words split on spaces; a hyphenated name (« Shangri-La », « Bobo-Dioulasso ») gives one initial per part.
  const fold = (w: string) => slugify(w.replace(/^[ldLD]['’]/, ""));
  const tokens = name.trim().split(/\s+/).map(fold).filter(Boolean);
  const kept = tokens.filter((w) => !STOP.has(w));
  const ws = kept.length ? kept : tokens;
  const letters = ws.flatMap((w) => w.split("-").filter(Boolean).map((p) => p[0]!));
  if (letters.length === 0) return "RC";
  if (letters.length === 1) return ws[0]!.replace(/-/g, "").slice(0, 2).toUpperCase();
  return letters.slice(0, 3).join("").toUpperCase();
}

/** « SL-261112-007 »: initials, business date (YYMMDD) and the day's number. Unique per business. */
export function orderCode(prefix: string, businessDate: string, number: number): string {
  return `${prefix}-${businessDate.slice(2).replaceAll("-", "")}-${String(number).padStart(3, "0")}`;
}

/** Reads a typed order number back: « sl-261112-7 », « SL261112007 » → date + number (prefix ignored). */
export function parseOrderCode(raw: string): { businessDate: string; number: number } | null {
  const m = /^\s*[a-z]{1,3}[-\s]?(\d{2})(\d{2})(\d{2})[-\s]?(\d{1,4})\s*$/i.exec(raw);
  if (!m) return null;
  return { businessDate: `20${m[1]}-${m[2]}-${m[3]}`, number: Number(m[4]) };
}
