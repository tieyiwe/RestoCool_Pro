import { NextResponse } from "next/server";
import { requireMember } from "@/lib/auth/context";
import { handle } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Menu items of the signed-in member's restaurant. Any restaurantId in the query is ignored. */
export const GET = handle(async () => {
  const { repo } = await requireMember("menu.read");
  const items = await repo.menu.items();
  return NextResponse.json({ restaurantId: repo.restaurantId, items });
});
