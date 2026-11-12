import { getLocale } from "next-intl/server";
import { z } from "zod";
import { getDb } from "@/db";
import { getMemberContext } from "@/lib/auth/context";
import { handle } from "@/lib/http";
import { markMessagesRead } from "@/lib/platform/messages";
import { notificationSummary } from "@/lib/platform/notifications";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/** The bell: unread count (+ the pop-up to show, if any). */
export const GET = handle(async () => {
  const ctx = await getMemberContext();
  if (!ctx) return Response.json({ unread: 0, support: 0, popup: null }, { headers: noStore });
  return Response.json(await notificationSummary(getDb(), ctx, await getLocale()), { headers: noStore });
});

const Body = z.object({ ids: z.array(z.uuid()).min(1).max(100) });

/** Marks messages as read (only ones addressed to this person). */
export const POST = handle(async (req: Request) => {
  const ctx = await getMemberContext();
  const memberId = ctx?.actor.memberId;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!ctx || !memberId || !parsed.success) return new Response(null, { status: 204 });
  await markMessagesRead(getDb(), { memberId, restaurantId: ctx.repo.restaurantId, role: ctx.actor.role }, parsed.data.ids);
  return new Response(null, { status: 204 });
});
