import { NextResponse } from "next/server";
import { z } from "zod";
import { NotFoundError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { serviceCtx } from "@/lib/orders/staff-api";
import { releaseTable, TableBusyError } from "@/lib/seating/floor";

export const dynamic = "force-dynamic";

/** « Table libérée »: staff free a table or room after the customers left (orders.serve). */
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) throw new NotFoundError();
  const ctx = await serviceCtx("orders.serve");
  try {
    const res = await releaseTable({ db: ctx.db, actor: ctx.actor, restaurantId: ctx.repo.restaurantId }, id.data);
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    if (err instanceof TableBusyError) return NextResponse.json({ error: "table_busy" }, { status: 409 });
    throw err;
  }
});
