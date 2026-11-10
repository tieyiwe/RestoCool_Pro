import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { members, restaurants } from "./restaurants";

/**
 * Personnel check-in / check-out (« pointage »). One open row per person at a time.
 * method: qr (check-in QR of the restaurant), code (RC number on restocool.com/pointage),
 * manager (checked in or out by the owner/manager).
 */
export const attendance = pgTable(
  "attendance",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    checkInAt: timestamp("check_in_at", { withTimezone: true }).notNull(),
    checkOutAt: timestamp("check_out_at", { withTimezone: true }),
    inMethod: text("in_method").$type<"qr" | "code" | "manager">().notNull(),
    outMethod: text("out_method").$type<"qr" | "code" | "manager">(),
    inBy: uuid("in_by").references(() => members.id, { onDelete: "set null" }),
    outBy: uuid("out_by").references(() => members.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("attendance_restaurant_idx").on(t.restaurantId, t.checkInAt),
    uniqueIndex("attendance_one_open_per_member").on(t.memberId).where(sql`${t.checkOutAt} is null`),
  ],
);
