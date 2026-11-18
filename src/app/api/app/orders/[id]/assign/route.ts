import { NextResponse } from "next/server";
import { z } from "zod";
import { reassignOrder } from "@/lib/assignments";
import { NotFoundError } from "@/lib/errors";
import { handle } from "@/lib/http";
import { serviceCtx } from "@/lib/orders/staff-api";

export const dynamic = "force-dynamic";

const Body = z.object({ memberId: z.uuid().nullable() });

/** A manager gives the order to another server (or back to everyone with null). */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) throw new NotFoundError();
  const body = Body.parse(await req.json().catch(() => null));
  const ctx = await serviceCtx("staff.write");
  return NextResponse.json(await reassignOrder(ctx, id.data, body.memberId));
});
