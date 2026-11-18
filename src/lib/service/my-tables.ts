import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { orders, staffAssignments } from "@/db/schema";
import { businessDate, memberIdOf, need, type ServiceCtx } from "@/lib/orders/service";
import { floorStatus, type FloorTable } from "@/lib/seating/floor";

export type MyOrder = {
  id: string;
  code: string | null;
  number: number;
  status: string;
  seatLabel: string | null;
  seatType: string | null;
  customerName: string | null;
  sentAt: string;
  readyAt: string | null;
  subtotal: number;
  mine: boolean;
};

export type MyTables = {
  /** True when the person has tables or areas today; false = they see every table (no plan yet). */
  assigned: boolean;
  tables: FloorTable[];
  toConfirm: MyOrder[];
  toServe: MyOrder[];
  billRequests: number;
};

/**
 * « Mes tables » (server's phone): their tables today (given seats + seats of given areas), new
 * orders to confirm and dishes ready to serve that are theirs or nobody's, bills asked for.
 * With no plan for them today, every table and every order is shown (pool).
 */
export async function myTables(ctx: ServiceCtx, opts: { all?: boolean } = {}, now = new Date()): Promise<MyTables> {
  need(ctx, "orders.read");
  const rid = ctx.repo.restaurantId;
  const me = await memberIdOf(ctx);
  const day = businessDate(now);
  const [floor, mine, active] = await Promise.all([
    floorStatus(ctx.db, rid, now),
    me
      ? ctx.db
          .select({ seatId: staffAssignments.seatId, areaId: staffAssignments.areaId })
          .from(staffAssignments)
          .where(and(eq(staffAssignments.restaurantId, rid), eq(staffAssignments.businessDate, day), eq(staffAssignments.memberId, me)))
      : Promise.resolve([]),
    ctx.db
      .select()
      .from(orders)
      .where(and(eq(orders.restaurantId, rid), inArray(orders.status, ["sent", "ready"])))
      .orderBy(asc(orders.sentAt))
      .limit(200),
  ]);
  const seatIds = new Set(mine.map((m) => m.seatId).filter(Boolean) as string[]);
  const areaIds = new Set(mine.map((m) => m.areaId).filter(Boolean) as string[]);
  const assigned = seatIds.size + areaIds.size > 0;
  const scoped = assigned && !opts.all;
  const tables = scoped ? floor.tables.filter((t) => seatIds.has(t.seatId) || (t.areaId && areaIds.has(t.areaId))) : floor.tables;
  const myTableIds = new Set(tables.map((t) => t.seatId));
  // An order is for me when it was given to me, or given to nobody and (no plan, or at one of my tables).
  const forMe = (o: (typeof active)[number]) => o.assignedStaffId === me || (!o.assignedStaffId && (!scoped || (o.seatId != null && myTableIds.has(o.seatId)) || !["table", "room", "area"].includes(o.seatType ?? "")));
  const view = (o: (typeof active)[number]): MyOrder => ({
    id: o.id,
    code: o.code,
    number: o.number,
    status: o.status,
    seatLabel: o.seatLabel,
    seatType: o.seatType,
    customerName: o.customerName,
    sentAt: o.sentAt.toISOString(),
    readyAt: o.readyAt?.toISOString() ?? null,
    subtotal: o.subtotal,
    mine: o.assignedStaffId != null && o.assignedStaffId === me,
  });
  const list = opts.all ? active : active.filter(forMe);
  return {
    assigned,
    tables,
    toConfirm: list.filter((o) => o.status === "sent").map(view),
    toServe: list.filter((o) => o.status === "ready").map(view),
    billRequests: tables.filter((t) => t.billRequestedAt).length,
  };
}
