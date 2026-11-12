import { z } from "zod";
import { getDb } from "@/db";
import { getMemberContext } from "@/lib/auth/context";
import { handle } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { deviceFromUa } from "@/lib/usage/device";
import { touchPresence, visitorKey } from "@/lib/usage/presence";
import { recordUsage } from "@/lib/usage/track";

export const dynamic = "force-dynamic";

const Body = z.object({
  kind: z.enum(["view", "beat"]),
  path: z.string().max(300).regex(/^\/app(\/|$)/),
  touch: z.boolean().optional(),
  standalone: z.boolean().optional(),
});

/** App usage heartbeat (a page was opened / the screen is still in use). Never fails the screen. */
export const POST = handle(async (req: Request) => {
  const ctx = await getMemberContext();
  if (!ctx) return new Response(null, { status: 204 });
  const who = ctx.actor.memberId ?? ctx.actor.userId;
  if (!rateLimit(`hb:${who}`, { capacity: 30, refillPerSec: 0.5 })) return new Response(null, { status: 204 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 204 });
  const { device, os } = deviceFromUa(req.headers.get("user-agent"), { touch: parsed.data.touch });
  const role = ctx.actor.role;
  touchPresence(visitorKey(`m:${who}`), {
    audience: role === "owner" ? "owner" : role === "manager" ? "manager" : "staff",
    device,
    os,
    standalone: parsed.data.standalone === true,
    restaurantId: ctx.repo.restaurantId,
  });
  if (ctx.actor.memberId) {
    // Ids in the path (orders, buses…) are not kept: only the screen.
    const path = parsed.data.path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id").split("?")[0]!;
    await recordUsage(getDb(), { restaurantId: ctx.repo.restaurantId, memberId: ctx.actor.memberId, kind: parsed.data.kind, path, via: ctx.pin ? "pin" : "account" });
  }
  return new Response(null, { status: 204 });
});
