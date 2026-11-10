import { NextResponse } from "next/server";
import { z } from "zod";
import { NotFoundError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { orderErrorResponse } from "@/lib/orders/http";
import { setOrderStatus, TARGET_STATUSES, type TargetStatus } from "@/lib/orders/service";
import { serviceCtx } from "@/lib/orders/staff-api";

export const dynamic = "force-dynamic";

const Body = z.object({ to: z.enum(TARGET_STATUSES as [TargetStatus, ...TargetStatus[]]), reason: z.string().trim().max(200).optional() });

/** Move an order on the board (confirm, prepare, ready, served, cancel with a reason). */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) throw new NotFoundError();
  const body = Body.parse(await req.json().catch(() => null));
  // Permission depends on the move: checked inside setOrderStatus (can()).
  const ctx = await serviceCtx("orders.read");
  try {
    await setOrderStatus(ctx, id.data, body.to, body.reason);
  } catch (err) {
    return orderErrorResponse(err);
  }
  return NextResponse.json({ ok: true });
});
