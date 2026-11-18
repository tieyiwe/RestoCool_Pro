import { NextResponse } from "next/server";
import { handle } from "@/lib/http";
import { serviceCtx } from "@/lib/orders/staff-api";
import { myTables } from "@/lib/service/my-tables";

export const dynamic = "force-dynamic";

/** « Mes tables » for the signed-in server (?all=1: every table). */
export const GET = handle(async (req: Request) => {
  const ctx = await serviceCtx("orders.read");
  const all = new URL(req.url).searchParams.get("all") === "1";
  return NextResponse.json({ ...(await myTables(ctx, { all })), now: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
});
