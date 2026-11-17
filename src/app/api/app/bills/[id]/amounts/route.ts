import { NextResponse } from "next/server";
import { z } from "zod";
import { AmountsInput, BillError, setBillAmounts } from "@/lib/billing";
import { NotFoundError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { serviceCtx } from "@/lib/orders/staff-api";

export const dynamic = "force-dynamic";

/** « Sur demande » price and discount (before any payment). */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) throw new NotFoundError();
  const input = AmountsInput.parse(await req.json().catch(() => null));
  const ctx = await serviceCtx("orders.pay");
  try {
    const b = await setBillAmounts(ctx, id.data, input);
    return NextResponse.json({ total: b.total, discount: b.discount, adjustment: b.adjustment });
  } catch (err) {
    if (err instanceof BillError) return NextResponse.json({ error: err.code }, { status: err.code === "discount_approval" ? 403 : 409 });
    throw err;
  }
});
