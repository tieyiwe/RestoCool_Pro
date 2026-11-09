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

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}
