import { NextResponse } from "next/server";
import { z } from "zod";
import { BillError, PayInput, payBill } from "@/lib/billing";
import { NotFoundError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { serviceCtx } from "@/lib/orders/staff-api";

export const dynamic = "force-dynamic";

/** Money received for a bill (all of it, or one part of a split bill). Needs the network. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) throw new NotFoundError();
  const input = PayInput.parse(await req.json().catch(() => null));
  const ctx = await serviceCtx("orders.pay");
  try {
    return NextResponse.json(await payBill(ctx, id.data, input));
  } catch (err) {
    if (err instanceof BillError) return NextResponse.json({ error: err.code }, { status: 409 });
    throw err;
  }
});
