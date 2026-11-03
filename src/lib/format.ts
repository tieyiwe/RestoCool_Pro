/** Narrow no-break space (U+202F), used as the FCFA thousands separator. */
export const NNBSP = " ";

/**
 * Format an integer FCFA amount: 5300 → "5 300 F" (narrow spaces).
 * Returns null for null/undefined so callers render "Sur demande" instead of "0 F".
 */
export function formatFCFA(amount: number | null | undefined): string | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return null;
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
  return `${sign}${digits}${NNBSP}F`;
}

/** Keep only digits; accept "+226 77 29 98 78", "0022677299878", "77299878". Returns "22677299878" or null. */
export function normalizeBfPhone(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 8) d = `226${d}`;
  return /^226\d{8}$/.test(d) ? d : null;
}

/** "+226 77 29 98 78". Falls back to the raw input if it is not a Burkina number. */
export function formatBfPhone(input: string): string {
  const n = normalizeBfPhone(input);
  if (!n) return input;
  const local = n.slice(3);
  return `+226 ${local.match(/.{2}/g)!.join(" ")}`;
}

/** tel: link target. */
export function telHref(input: string): string {
  const n = normalizeBfPhone(input);
  return n ? `tel:+${n}` : `tel:${input.replace(/[^\d+]/g, "")}`;
}

/** Free click-to-chat WhatsApp link. */
export function whatsappHref(input: string, text?: string): string | null {
  const n = normalizeBfPhone(input);
  if (!n) return null;
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export const RESTAURANT_TZ = "Africa/Ouagadougou";

/** "14:05" in the restaurant's timezone. */
export function formatTime(date: Date, timeZone = RESTAURANT_TZ): string {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(date);
}
