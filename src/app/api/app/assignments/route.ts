import { NextResponse } from "next/server";
import { z } from "zod";
import { copyYesterday, dayAssignments, SetAssignmentsInput, setAssignments } from "@/lib/assignments";
import { handle } from "@/lib/http";
import { serviceCtx } from "@/lib/orders/staff-api";

export const dynamic = "force-dynamic";

/** Today's plan (who serves which tables). */
export const GET = handle(async () => {
  const ctx = await serviceCtx("orders.read");
  return NextResponse.json(await dayAssignments(ctx), { headers: { "Cache-Control": "no-store" } });
});

const Body = z.union([SetAssignmentsInput, z.object({ copyYesterday: z.literal(true) })]);

/** Give one server their tables/areas for today, or copy yesterday's plan (staff.write). */
export const POST = handle(async (req: Request) => {
  const body = Body.parse(await req.json().catch(() => null));
  const ctx = await serviceCtx("staff.write");
  if ("copyYesterday" in body) return NextResponse.json({ copied: await copyYesterday(ctx) });
  return NextResponse.json(await setAssignments(ctx, body));
});
