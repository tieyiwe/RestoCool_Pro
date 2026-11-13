/**
 * What a scanned RestoCool QR (or a typed numéro RC) opens in the app. Pure, shared with tests.
 * QR codes may carry another host (restocool.com vs the replit.app address): only the path counts,
 * and only known RestoCool paths are opened, always on the current site.
 */
export type ScanTarget = { kind: "order" | "checkin" | "join" | "menu" | "code" | "reservation"; path: string } | null;

const CODE = /^(?:RC[-\s]?)?([A-HJKMNP-TW-Z2-9]{5})$/i;

export function scanTarget(raw: string): ScanTarget {
  const text = raw.trim();
  if (!text) return null;
  const code = text.replace(/\s+/g, "").match(CODE);
  if (code) return { kind: "code", path: `/c/${code[1]!.toUpperCase()}` };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const p = url.pathname;
  let m: RegExpMatchArray | null;
  if ((m = p.match(/^\/(?:app\/orders|o)\/([0-9a-f-]{36})\/?$/i))) return { kind: "order", path: `/app/orders/${m[1]!.toLowerCase()}` };
  // A guest's reservation QR (confirmation email): the check-in screen.
  if ((m = p.match(/^\/(?:rv|app\/reservations\/checkin)\/([A-Za-z0-9_-]{16,64})\/?$/))) return { kind: "reservation", path: `/app/reservations/checkin/${m[1]}` };
  if ((m = p.match(/^\/pointage\/([A-Za-z0-9_-]{16,128})\/?$/))) return { kind: "checkin", path: `/pointage/${m[1]}` };
  if ((m = p.match(/^\/rejoindre\/([A-Za-z0-9_-]{16,64})\/?$/))) return { kind: "join", path: `/rejoindre/${m[1]}` };
  if ((m = p.match(/^\/r\/([a-z0-9-]{1,80})(\/[tb]\/[A-Za-z0-9_-]{16,128})?\/?$/))) return { kind: "menu", path: `/r/${m[1]}${m[2] ?? ""}` };
  if ((m = p.match(/^\/c\/([A-Za-z0-9-]{5,8})\/?$/))) {
    const c = m[1]!.replace(/^RC-?/i, "").match(CODE);
    return c ? { kind: "code", path: `/c/${c[1]!.toUpperCase()}` } : null;
  }
  return null;
}
