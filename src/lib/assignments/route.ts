import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "@/db";
import { members, staffAssignments } from "@/db/schema";

/** Africa/Ouagadougou is UTC: the business day is the UTC date (same as orders). */
const businessDate = (now: Date) => now.toISOString().slice(0, 10);

/** The server of a seat today: its own assignment first, then its area's (the earliest given). */
export async function assigneeFor(db: Pick<DB, "select">, restaurantId: string, seat: { id: string; areaId: string | null }, now = new Date()): Promise<string | null> {
  const day = businessDate(now);
  const rows = await db
    .select({ memberId: staffAssignments.memberId, seatId: staffAssignments.seatId, areaId: staffAssignments.areaId })
    .from(staffAssignments)
    .innerJoin(members, eq(members.id, staffAssignments.memberId))
    .where(
      and(
        eq(staffAssignments.restaurantId, restaurantId),
        eq(staffAssignments.businessDate, day),
        eq(members.active, true),
        isNull(members.archivedAt),
      ),
    )
    .orderBy(staffAssignments.createdAt);
  const bySeat = rows.find((r) => r.seatId === seat.id);
  if (bySeat) return bySeat.memberId;
  const byArea = seat.areaId ? rows.find((r) => r.areaId === seat.areaId) : undefined;
  return byArea?.memberId ?? null;
}

