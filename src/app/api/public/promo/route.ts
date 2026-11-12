import { z } from "zod";
import { getDb } from "@/db";
import { handle } from "@/lib/http";
import { countPromo } from "@/lib/promotions";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({ id: z.uuid(), kind: z.enum(["view", "click"]) });

/** Counts a promotion seen or tapped (anonymous; no id, cookie or IP stored). */
export const POST = handle(async (req: Request) => {
  if (!rateLimit(`promo:${clientIp(req)}`, { capacity: 60, refillPerSec: 1 })) return new Response(null, { status: 204 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (parsed.success) await countPromo(getDb(), parsed.data.id, parsed.data.kind);
  return new Response(null, { status: 204 });
});
