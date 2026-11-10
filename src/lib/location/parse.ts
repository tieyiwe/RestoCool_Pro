/**
 * Business location helpers (no paid map API). In Burkina people share places as Google Maps
 * links rather than street addresses, so we read coordinates from those links, or from the phone.
 */
export type LatLng = { lat: number; lng: number };

export function validLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

const num = "(-?\\d{1,3}(?:\\.\\d+)?)";
const PATTERNS: RegExp[] = [
  // Exact place pin: …!3d12.3714!4d-1.5197
  new RegExp(`!3d${num}!4d${num}`),
  // Map centre: …/@12.3714,-1.5197,17z
  new RegExp(`@${num},${num}`),
  // ?q=12.37,-1.51  ?query=  ?ll=  ?destination=  ?center=
  new RegExp(`[?&](?:q|query|ll|destination|center|daddr)=${num}(?:,|%2C)\\s*${num}`, "i"),
  // Bare "12.3714, -1.5197" (copied coordinates)
  new RegExp(`^\\s*${num}\\s*,\\s*${num}\\s*$`),
];

/** Coordinates from a Google Maps link (long form) or a pasted « lat, lng ». Null if none. */
export function latLngFromText(input: string): LatLng | null {
  const text = input.trim();
  for (const re of PATTERNS) {
    const m = re.exec(text);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (validLatLng(lat, lng)) return { lat: round(lat), lng: round(lng) };
    }
  }
  return null;
}

/** Short share links (« maps.app.goo.gl/… ») must be opened once on the server to read them. */
export const SHORT_LINK_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"]);
export function isShortMapsLink(input: string): boolean {
  try {
    const u = new URL(input.trim());
    return u.protocol === "https:" && SHORT_LINK_HOSTS.has(u.hostname) && (u.hostname !== "goo.gl" || u.pathname.startsWith("/maps"));
  } catch {
    return false;
  }
}

/** 6 decimals ≈ 10 cm: plenty for a door, and keeps the data tidy. */
export const round = (x: number) => Math.round(x * 1e6) / 1e6;

/** Opens Google Maps (app on phones) with directions to the business. Free, no API key. */
export const directionsUrl = (p: LatLng) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
/** Opens Google Maps on the exact point (to check it, or to share). */
export const placeUrl = (p: LatLng) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
/** Free OpenStreetMap preview (iframe), no key, used only to confirm the point. */
export function osmEmbedUrl(p: LatLng, d = 0.004): string {
  const bbox = [p.lng - d, p.lat - d, p.lng + d, p.lat + d].map((x) => x.toFixed(6)).join(",");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${p.lat},${p.lng}`;
}
