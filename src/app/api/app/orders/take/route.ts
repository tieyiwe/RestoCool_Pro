import { NextResponse } from "next/server";
import { NotFoundError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { orderErrorResponse } from "@/lib/orders/http";
import { placeStaffOrder, StaffOrderInput } from "@/lib/orders/staff-order";
import { serviceCtx } from "@/lib/orders/staff-api";

export const dynamic = "force-dynamic";

/** « Prendre une commande »: a server enters an order for a customer (orders.create). */
export const POST = handle(async (req: Request) => {
  const body = StaffOrderInput.parse(await req.json().catch(() => null));
  const ctx = await serviceCtx("orders.create");
  const r = await ctx.repo.restaurant.get();
  if (!r) throw new NotFoundError();
  try {
    const o = await placeStaffOrder(ctx, r, body);
    return NextResponse.json({ id: o.id, number: o.number, code: o.code });
  } catch (err) {
    return orderErrorResponse(err);
  }
});
