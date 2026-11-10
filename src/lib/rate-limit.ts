/**
 * In-memory token bucket (one server process on a Reserved VM, as planned).
 * Keyed by IP + device id for public endpoints.
 */
type Bucket = { tokens: number; updated: number };
const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

export function rateLimit(key: string, opts: { capacity: number; refillPerSec: number }, now = Date.now()): boolean {
  if (now - lastSweep > 60_000) {
    for (const [k, b] of buckets) if (now - b.updated > 600_000) buckets.delete(k);
    lastSweep = now;
  }
  const b = buckets.get(key) ?? { tokens: opts.capacity, updated: now };
  b.tokens = Math.min(opts.capacity, b.tokens + ((now - b.updated) / 1000) * opts.refillPerSec);
  b.updated = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
}

/**
 * The visitor's IP, for rate limits. X-Forwarded-For is a list the client can pre-fill with
 * anything, so the first entry can't be trusted: each proxy in front of the app appends the
 * address it saw. With N trusted proxies (TRUSTED_PROXY_HOPS, default 1 = Replit's), the real
 * client is the N-th entry from the right.
 */
export function ipFromHeaders(h: Pick<Headers, "get">): string {
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 1) || 1);
  const list = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (list.length > 0) return list[Math.max(0, list.length - hops)]!;
  return h.get("x-real-ip")?.trim() || "unknown";
}

export function clientIp(req: Request): string {
  return ipFromHeaders(req.headers);
}
