import { NextResponse } from "next/server";
import { handle } from "@/lib/http";
import { serviceCtx } from "@/lib/orders/staff-api";
import { floorStatus } from "@/lib/seating/floor";

export const dynamic = "force-dynamic";

/** Live floor plan: every table and room of the member's business, with today's order counts. */
export const GET = handle(async () => {
  const ctx = await serviceCtx("orders.read");
  return NextResponse.json(await floorStatus(ctx.db, ctx.repo.restaurantId), { headers: { "Cache-Control": "no-store" } });
});
