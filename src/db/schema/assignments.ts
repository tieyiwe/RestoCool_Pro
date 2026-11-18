import { sql } from "drizzle-orm";
import { date, index, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { members, restaurants } from "./restaurants";
import { areas, seats } from "./seating";

/**
 * Who serves what today: a server is given tables/rooms (seat) or a whole area for one business
 * day (the shift). A new order goes to the server of its seat, else of its area, else to the pool
 * (everyone sees it). One server per seat per day; several servers may share an area.
 */
export const staffAssignments = pgTable(
  "staff_assignments",
  {
    id: id(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    /** Business day (Africa/Ouagadougou = UTC date). */
    businessDate: date("business_date", { mode: "string" }).notNull(),
    seatId: uuid("seat_id").references(() => seats.id, { onDelete: "cascade" }),
    areaId: uuid("area_id").references(() => areas.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => members.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("staff_assignments_day_idx").on(t.restaurantId, t.businessDate),
    uniqueIndex("staff_assignments_seat_uq").on(t.restaurantId, t.businessDate, t.seatId).where(sql`${t.seatId} is not null`),
    uniqueIndex("staff_assignments_area_uq").on(t.restaurantId, t.businessDate, t.areaId, t.memberId).where(sql`${t.areaId} is not null`),
  ],
);
export type StaffAssignment = typeof staffAssignments.$inferSelect;
