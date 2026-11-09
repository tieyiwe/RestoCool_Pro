import type { PublicHours } from "./types";

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export type OpenStatus = { open: boolean; closesAt?: string; opensAt?: string };

/**
 * Open / closed right now. Africa/Ouagadougou is UTC+0 with no daylight saving, so UTC is local time.
 * Handles service past midnight (closes earlier than it opens).
 */
export function openStatus(hours: PublicHours[], now: Date = new Date()): OpenStatus {
  if (hours.length === 0) return { open: false };
  const day = now.getUTCDay();
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  const yesterday = (day + 6) % 7;

  for (const h of hours.filter((x) => x.weekday === day)) {
    const o = toMin(h.opens);
    const c = toMin(h.closes);
    const overnight = c <= o;
    if (minute >= o && (overnight || minute < c)) return { open: true, closesAt: h.closes.slice(0, 5) };
  }
  for (const h of hours.filter((x) => x.weekday === yesterday)) {
    const o = toMin(h.opens);
    const c = toMin(h.closes);
    if (c <= o && minute < c) return { open: true, closesAt: h.closes.slice(0, 5) };
  }
  // Next opening today, else the next day that has hours.
  const later = hours.filter((x) => x.weekday === day && toMin(x.opens) > minute).sort((a, b) => toMin(a.opens) - toMin(b.opens))[0];
  if (later) return { open: false, opensAt: later.opens.slice(0, 5) };
  return { open: false };
}
