import { check, date, index, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, timestamps } from "./_shared";
import { restaurants } from "./restaurants";

export const RESERVATION_STATUSES = ["requested", "confirmed", "declined", "seated", "completed", "no_show", "cancelled"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/**
 * Table reservations made from the business's public page. The customer gets emails from
 * RestoCool and a private link (`token_hash`) to see or cancel it; the business calls them and
 * confirms or declines.
 *  requested → confirmed | declined | cancelled;  confirmed → seated → completed | no_show | cancelled
 * Date and time are the business's local day and hour (Africa/Ouagadougou = UTC).
 */
export const reservations = pgTable(
  "reservations",
  {
    id: id(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    /** Short reference shown to the customer and the staff, e.g. « R-K7M3P » (unique per business). */
    ref: text("ref").notNull(),
    date: date("date").notNull(),
    /** « 19:30 » */
    time: text("time").notNull(),
    partySize: smallint("party_size").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    note: text("note"),
    /** Language of the customer's emails (fr, en, zh). */
    locale: text("locale").notNull().default("fr"),
    status: text("status").$type<ReservationStatus>().notNull().default("requested"),
    /** SHA-256 of the customer's private link token (never the token). */
    tokenHash: text("token_hash").notNull(),
    /** SHA-256 of the anonymous device id that made it (rate limits). */
    deviceHash: text("device_hash"),
    /** The business called the customer (« Appelé »): when and who. */
    contactedAt: timestamp("contacted_at", { withTimezone: true }),
    contactedBy: text("contacted_by"),
    /** Reason given when the business declines or cancels (sent to the customer). */
    reason: text("reason"),
    cancelledBy: text("cancelled_by").$type<"customer" | "business">(),
    /** Who changed the status last (user id or member id) and when. */
    statusBy: text("status_by"),
    statusAt: timestamp("status_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("reservations_day_idx").on(t.restaurantId, t.date, t.time),
    index("reservations_status_idx").on(t.restaurantId, t.status),
    uniqueIndex("reservations_ref_uq").on(t.restaurantId, t.ref),
    uniqueIndex("reservations_token_uq").on(t.tokenHash),
    index("reservations_created_idx").on(t.createdAt),
    check("reservations_party_range", sql`${t.partySize} between 1 and 200`),
  ],
);
export type Reservation = typeof reservations.$inferSelect;
