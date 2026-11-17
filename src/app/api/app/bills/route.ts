import { NextResponse } from "next/server";
import { z } from "zod";
import { BillError, openBill } from "@/lib/billing";
import { handle } from "@/lib/http";
import { serviceCtx } from "@/lib/orders/staff-api";

export const dynamic = "force-dynamic";

const Body = z.union([z.object({ orderId: z.uuid() }), z.object({ sessionId: z.uuid() })]);

/** Opens (or reuses) the bill of a table or of one order: « Encaisser ». */
export const POST = handle(async (req: Request) => {
  const body = Body.parse(await req.json().catch(() => null));
  const ctx = await serviceCtx("orders.pay");
  try {
    const bill = await openBill(ctx, body);
    return NextResponse.json({ billId: bill.id });
  } catch (err) {
    if (err instanceof BillError) return NextResponse.json({ error: err.code }, { status: 409 });
    throw err;
  }
});
