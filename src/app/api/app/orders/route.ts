import { NextResponse } from "next/server";
import { handle } from "@/lib/http";
import { staffOrder } from "@/lib/orders/serialize";
import { serviceOrders } from "@/lib/orders/service";
import { serviceCtx } from "@/lib/orders/staff-api";
import { personLookup, personnel } from "@/lib/personnel";
import { openTableSessionIds } from "@/lib/seating/floor";

export const dynamic = "force-dynamic";

/** Front desk / kitchen board: open orders of the signed-in member's restaurant only. */
export const GET = handle(async () => {
  const ctx = await serviceCtx("orders.read");
  const [list, seats, areas, people, openTables] = await Promise.all([
    serviceOrders(ctx),
    ctx.repo.seating.seats(),
    ctx.repo.seating.areas(),
    personnel(ctx.db, ctx.repo.restaurantId),
    openTableSessionIds(ctx.db, ctx.repo.restaurantId),
  ]);
  const who = personLookup(people);
  const areaBySeat = new Map(seats.map((s) => [s.id, areas.find((a) => a.id === s.areaId) ?? null]));
  const areaOf = (seatId: string | null) => {
    const a = seatId ? areaBySeat.get(seatId) : null;
    return a ? { id: a.id, name: a.name } : null;
  };
  return NextResponse.json({ orders: list.map((o) => staffOrder(o, areaOf, who, openTables)), now: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
});
