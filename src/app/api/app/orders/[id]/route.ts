import { NextResponse } from "next/server";
import { z } from "zod";
import { NotFoundError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { staffOrder } from "@/lib/orders/serialize";
import { personLookup, personnel } from "@/lib/personnel";
import { getOrder } from "@/lib/orders/service";
import { serviceCtx } from "@/lib/orders/staff-api";
import { openTableSessionIds } from "@/lib/seating/floor";

export const dynamic = "force-dynamic";

/** One order (scanned from « Montrer au serveur »). Another restaurant's order is a 404. */
export const GET = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) throw new NotFoundError();
  const ctx = await serviceCtx("orders.read");
  const [order, people, openTables] = await Promise.all([getOrder(ctx, id.data), personnel(ctx.db, ctx.repo.restaurantId), openTableSessionIds(ctx.db, ctx.repo.restaurantId)]);
  return NextResponse.json({ order: staffOrder(order, undefined, personLookup(people), openTables) }, { headers: { "Cache-Control": "no-store" } });
});
