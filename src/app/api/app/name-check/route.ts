import { z } from "zod";
import { getDb } from "@/db";
import { getIdentityProfile } from "@/lib/auth/context";
import { rateLimit } from "@/lib/rate-limit";
import { checkBusinessName } from "@/lib/restaurants/name-check";

export const dynamic = "force-dynamic";

const Query = z.object({
  name: z.string().trim().min(2).max(80),
  city: z.string().trim().max(60).optional(),
  kind: z.enum(["restaurant", "transport"]).default("restaurant"),
});

/** « Nom disponible ? » while a signed-in person types the name of the business they create. */
export async function GET(req: Request) {
  const user = await getIdentityProfile();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`name-check:${user.userId}`, { capacity: 30, refillPerSec: 1 })) return Response.json({ error: "rate_limited" }, { status: 429 });
  const q = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return Response.json({ error: "invalid" }, { status: 400 });
  const res = await checkBusinessName(getDb(), q.data.name, { city: q.data.city, kind: q.data.kind });
  return Response.json(res, { headers: { "cache-control": "no-store" } });
}
