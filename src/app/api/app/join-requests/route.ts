import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { requireMember } from "@/lib/auth/context";
import { handle } from "@/lib/http";
import { pendingJoinRequests } from "@/lib/personnel/join";

export const dynamic = "force-dynamic";

/** People waiting to join the team (for the owner's live prompt). Personnel managers only. */
export const GET = handle(async () => {
  const ctx = await requireMember("staff.write");
  const list = await pendingJoinRequests(getDb(), ctx.repo.restaurantId);
  return NextResponse.json({ count: list.length, latest: list[0] ? { id: list[0].id, name: list[0].name } : null }, { headers: { "Cache-Control": "no-store" } });
});
