import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { restaurants } from "@/db/schema";
import { handle } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { deviceFromUa } from "@/lib/usage/device";
import { touchPresence, visitorKey } from "@/lib/usage/presence";

export const dynamic = "force-dynamic";

const Body = z.object({
  path: z.string().max(300).startsWith("/"),
  /** The anonymous id the menu already keeps on this phone (random, no personal data). */
  deviceId: z.string().min(8).max(80).optional(),
  touch: z.boolean().optional(),
  standalone: z.boolean().optional(),
});

/** Slug → id, small cache (menus are opened all day long). */
const slugs = new Map<string, { id: string | null; at: number }>();
async function restaurantId(slug: string): Promise<string | null> {
  const hit = slugs.get(slug);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.id;
  const [r] = await getDb().select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.slug, slug)).limit(1);
  if (slugs.size > 5000) slugs.clear();
  slugs.set(slug, { id: r?.id ?? null, at: Date.now() });
  return r?.id ?? null;
}

/**
 * « Someone is looking at a public page » (menu or site), every minute while the page is visible:
 * the platform's live traffic. Anonymous: a hashed device id, never a name, phone or IP stored.
 */
export const POST = handle(async (req: Request) => {
  const ip = clientIp(req);
  if (!rateLimit(`beat:${ip}`, { capacity: 120, refillPerSec: 2 })) return new Response(null, { status: 204 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 204 });
  const ua = req.headers.get("user-agent");
  if (/bot|crawl|spider|slurp|headless|lighthouse/i.test(ua ?? "")) return new Response(null, { status: 204 });
  const { device, os } = deviceFromUa(ua, { touch: parsed.data.touch });
  const m = /^\/r\/([a-z0-9-]{1,80})(\/|$|\?)/.exec(parsed.data.path);
  const rid = m ? await restaurantId(m[1]!) : null;
  touchPresence(visitorKey(parsed.data.deviceId ? `d:${parsed.data.deviceId}` : `ip:${ip}:${ua ?? ""}`), {
    audience: rid ? "customer" : "visitor",
    device,
    os,
    standalone: parsed.data.standalone === true,
    restaurantId: rid,
  });
  return new Response(null, { status: 204 });
});
