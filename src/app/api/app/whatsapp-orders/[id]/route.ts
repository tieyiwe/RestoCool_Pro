import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { requireMember } from "@/lib/auth/context";
import { NotFoundError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { orderErrorResponse } from "@/lib/orders/http";
import { setOrderStatus } from "@/lib/orders/service";

export const dynamic = "force-dynamic";

const Body = z.object({ to: z.enum(["confirmed", "ready", "served", "cancelled"]), reason: z.string().trim().max(200).optional() });

/**
 * Move a WhatsApp takeaway order: « Confirmée », « Prête », « Remise au client » (served) or
 * « Annulée ». Works on every plan (no service board needed); each move checks its permission.
 */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) throw new NotFoundError();
  const body = Body.parse(await req.json().catch(() => null));
  const m = await requireMember("orders.read");
  const db = getDb();
  const [o] = await db.select({ status: orders.status }).from(orders).where(and(eq(orders.restaurantId, m.repo.restaurantId), eq(orders.id, id.data), eq(orders.channel, "whatsapp")));
  if (!o) throw new NotFoundError();
  const ctx = { db, actor: m.actor, repo: m.repo };
  try {
    // Handed over straight from « reçue »: it counts as confirmed first.
    if (body.to === "served" && o.status === "sent") await setOrderStatus(ctx, id.data, "confirmed");
    await setOrderStatus(ctx, id.data, body.to, body.to === "cancelled" ? body.reason || "Annulée par l’établissement" : undefined);
  } catch (err) {
    return orderErrorResponse(err);
  }
  return NextResponse.json({ ok: true });
});
