import "server-only";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { areas, members, orders, seats, staffAssignments } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { NotFoundError } from "@/lib/errors";
import { businessDate, memberIdOf, need, type ServiceCtx } from "@/lib/orders/service";
import { notify } from "@/lib/realtime/events";
export { assigneeFor } from "./route";

/**
 * Who serves which tables today (section 8 « Assignment »). Assignments last one business day
 * (the shift). New orders go to the server of their seat, else of its area, else to the pool.
 */

export type DayAssignments = {
  day: string;
  people: Array<{ id: string; name: string; staffNo: number | null; role: string; seatIds: string[]; areaIds: string[] }>;
  seats: Array<{ id: string; label: string; type: string; areaId: string | null }>;
  areas: Array<{ id: string; name: string }>;
};

/** Today's plan: everyone who can serve, the tables/rooms and areas, and who has what. */
export async function dayAssignments(ctx: ServiceCtx, now = new Date()): Promise<DayAssignments> {
  need(ctx, "orders.read");
  const rid = ctx.repo.restaurantId;
  const day = businessDate(now);
  const [team, seatRows, areaRows, rows] = await Promise.all([
    ctx.db
      .select({ id: members.id, name: members.name, staffNo: members.staffNo, role: members.role })
      .from(members)
      .where(and(eq(members.restaurantId, rid), eq(members.active, true), isNull(members.archivedAt), ne(members.role, "kitchen"), ne(members.role, "cashier")))
      .orderBy(members.staffNo),
    ctx.db
      .select({ id: seats.id, label: seats.label, type: seats.type, areaId: seats.areaId, sort: seats.sort })
      .from(seats)
      .where(and(eq(seats.restaurantId, rid), eq(seats.active, true), isNull(seats.busId), inArray(seats.type, ["table", "room", "area"])))
      .orderBy(seats.type, seats.sort, seats.label),
    ctx.db.select({ id: areas.id, name: areas.name }).from(areas).where(eq(areas.restaurantId, rid)).orderBy(areas.sort),
    ctx.db.select().from(staffAssignments).where(and(eq(staffAssignments.restaurantId, rid), eq(staffAssignments.businessDate, day))),
  ]);
  return {
    day,
    people: team.map((m) => ({
      id: m.id,
      name: m.name ?? "—",
      staffNo: m.staffNo,
      role: m.role,
      seatIds: rows.filter((r) => r.memberId === m.id && r.seatId).map((r) => r.seatId!),
      areaIds: rows.filter((r) => r.memberId === m.id && r.areaId).map((r) => r.areaId!),
    })),
    seats: seatRows.map(({ sort: _s, ...x }) => x),
    areas: areaRows.map((a) => ({ id: a.id, name: a.name.fr })),
  };
}

export const SetAssignmentsInput = z.object({
  memberId: z.uuid(),
  seatIds: z.array(z.uuid()).max(200),
  areaIds: z.array(z.uuid()).max(50),
});

/**
 * Gives one server their tables and areas for today (replaces what they had). A table given to
 * them is taken from whoever had it: one server per table.
 */
export async function setAssignments(ctx: ServiceCtx, input: z.infer<typeof SetAssignmentsInput>, now = new Date()) {
  need(ctx, "staff.write");
  const rid = ctx.repo.restaurantId;
  const day = businessDate(now);
  const [m] = await ctx.db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.restaurantId, rid), eq(members.id, input.memberId), eq(members.active, true), isNull(members.archivedAt)));
  if (!m) throw new NotFoundError();
  // Only this business's seats and areas.
  const okSeats = input.seatIds.length
    ? (await ctx.db.select({ id: seats.id }).from(seats).where(and(eq(seats.restaurantId, rid), inArray(seats.id, input.seatIds)))).map((s) => s.id)
    : [];
  const okAreas = input.areaIds.length
    ? (await ctx.db.select({ id: areas.id }).from(areas).where(and(eq(areas.restaurantId, rid), inArray(areas.id, input.areaIds)))).map((a) => a.id)
    : [];
  const by = await memberIdOf(ctx);
  await ctx.db.transaction(async (tx) => {
    await tx.delete(staffAssignments).where(and(eq(staffAssignments.restaurantId, rid), eq(staffAssignments.businessDate, day), eq(staffAssignments.memberId, m.id)));
    if (okSeats.length) {
      await tx.delete(staffAssignments).where(and(eq(staffAssignments.restaurantId, rid), eq(staffAssignments.businessDate, day), inArray(staffAssignments.seatId, okSeats)));
      await tx.insert(staffAssignments).values(okSeats.map((seatId) => ({ restaurantId: rid, memberId: m.id, businessDate: day, seatId, createdBy: by })));
    }
    if (okAreas.length) await tx.insert(staffAssignments).values(okAreas.map((areaId) => ({ restaurantId: rid, memberId: m.id, businessDate: day, areaId, createdBy: by })));
    await writeAudit(tx, ctx.actor, { restaurantId: rid, action: "staff.assigned", entity: "member", entityId: m.id, data: { day, seats: okSeats.length, areas: okAreas.length } });
    await notify(tx, { k: "notice", r: rid });
  });
  return { seats: okSeats.length, areas: okAreas.length };
}

/** « Reprendre le plan d'hier »: copies yesterday's assignments of people still active (nothing if today has some). */
export async function copyYesterday(ctx: ServiceCtx, now = new Date()) {
  need(ctx, "staff.write");
  const rid = ctx.repo.restaurantId;
  const day = businessDate(now);
  const prev = businessDate(new Date(now.getTime() - 86_400_000));
  const today = await ctx.db.select({ id: staffAssignments.id }).from(staffAssignments).where(and(eq(staffAssignments.restaurantId, rid), eq(staffAssignments.businessDate, day))).limit(1);
  if (today.length) return 0;
  const rows = await ctx.db
    .select({ memberId: staffAssignments.memberId, seatId: staffAssignments.seatId, areaId: staffAssignments.areaId })
    .from(staffAssignments)
    .innerJoin(members, eq(members.id, staffAssignments.memberId))
    .where(and(eq(staffAssignments.restaurantId, rid), eq(staffAssignments.businessDate, prev), eq(members.active, true), isNull(members.archivedAt)));
  if (!rows.length) return 0;
  const by = await memberIdOf(ctx);
  await ctx.db.insert(staffAssignments).values(rows.map((r) => ({ ...r, restaurantId: rid, businessDate: day, createdBy: by }))).onConflictDoNothing();
  await writeAudit(ctx.db, ctx.actor, { restaurantId: rid, action: "staff.assigned.copied", entity: "restaurant", entityId: rid, data: { day, rows: rows.length } });
  return rows.length;
}

/** A manager gives an order to another server (or back to the pool with null). */
export async function reassignOrder(ctx: ServiceCtx, orderId: string, memberId: string | null) {
  need(ctx, "staff.write");
  const rid = ctx.repo.restaurantId;
  if (memberId) {
    const [m] = await ctx.db.select({ id: members.id }).from(members).where(and(eq(members.restaurantId, rid), eq(members.id, memberId), eq(members.active, true), isNull(members.archivedAt)));
    if (!m) throw new NotFoundError();
  }
  const [o] = await ctx.db
    .update(orders)
    .set({ assignedStaffId: memberId })
    .where(and(eq(orders.restaurantId, rid), eq(orders.id, orderId)))
    .returning({ id: orders.id, sessionId: orders.sessionId });
  if (!o) throw new NotFoundError();
  await writeAudit(ctx.db, ctx.actor, { restaurantId: rid, action: "order.reassigned", entity: "order", entityId: o.id, data: { to: memberId } });
  await notify(ctx.db, { k: "order", r: rid, o: o.id, s: o.sessionId, d: null });
  return { ok: true };
}
