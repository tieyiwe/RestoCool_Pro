import { NextResponse } from "next/server";
import { z } from "zod";
import { NotFoundError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { orderErrorResponse } from "@/lib/orders/http";
import { setItemStatus } from "@/lib/orders/service";
import { serviceCtx } from "@/lib/orders/staff-api";

export const dynamic = "force-dynamic";

const Body = z.object({ status: z.enum(["pending", "preparing", "ready"]) });

/** Kitchen: mark one dish as started or ready. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) => {
  const p = await params;
  const ids = z.object({ id: z.uuid(), itemId: z.uuid() }).safeParse(p);
  if (!ids.success) throw new NotFoundError();
  const body = Body.parse(await req.json().catch(() => null));
  const ctx = await serviceCtx("orders.prepare");
  try {
    await setItemStatus(ctx, ids.data.id, ids.data.itemId, body.status);
  } catch (err) {
    return orderErrorResponse(err);
  }
  return NextResponse.json({ ok: true });
});
