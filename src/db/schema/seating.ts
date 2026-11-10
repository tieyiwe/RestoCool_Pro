import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, smallint, text, timestamp, uniqueIndex, uuid, pgTable } from "drizzle-orm/pg-core";
import { id, timestamps, type I18nText } from "./_shared";
import { seatTypeEnum } from "./enums";
import { restaurants } from "./restaurants";

export const areas = pgTable(
  "areas",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    name: jsonb("name").$type<I18nText>().notNull(),
    sort: integer("sort").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("areas_restaurant_idx").on(t.restaurantId)],
);

export const seats = pgTable(
  "seats",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    type: seatTypeEnum("type").notNull(),
    label: text("label").notNull(),
    areaId: uuid("area_id").references(() => areas.id, { onDelete: "set null" }),
    capacity: smallint("capacity"),
    /** Random (>=128 bit) token printed in the seat's QR code. */
    qrToken: text("qr_token").notNull(),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("seats_restaurant_idx").on(t.restaurantId),
    uniqueIndex("seats_qr_token_uq").on(t.qrToken),
    uniqueIndex("seats_restaurant_type_label_uq").on(t.restaurantId, t.type, t.label),
  ],
);

export const sessionStatusEnum = pgEnum("table_session_status", ["open", "closed"]);

/**
 * A table session: everyone at one seat shares it (group ordering, shared bill in M4).
 * At most one open session per seat (partial unique index).
 */
export const tableSessions = pgTable(
  "table_sessions",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    seatId: uuid("seat_id").notNull().references(() => seats.id, { onDelete: "cascade" }),
    status: sessionStatusEnum("status").notNull().default("open"),
    /** How the seat was chosen: scanning the seat's own QR, or the picker (generic QR). */
    source: text("source").$type<"qr" | "picker">().notNull(),
    openedByDevice: text("opened_by_device"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    /** released (all phones left) | inactive (inactivity release) | expired (idle for hours) | staff | paid */
    closedReason: text("closed_reason"),
    closedBy: text("closed_by"),
    ...timestamps,
  },
  (t) => [
    index("table_sessions_restaurant_idx").on(t.restaurantId, t.status),
    uniqueIndex("table_sessions_one_open_per_seat").on(t.seatId).where(sql`${t.status} = 'open'`),
  ],
);

/** Phones (anonymous device ids) that joined a session. */
export const sessionDevices = pgTable(
  "session_devices",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").notNull().references(() => tableSessions.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    /** Counter mode: the customer's first name. Delivery: address/phone come with the order (M4). */
    customerName: text("customer_name"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("session_devices_restaurant_idx").on(t.restaurantId),
    uniqueIndex("session_devices_session_device_uq").on(t.sessionId, t.deviceId),
  ],
);

/**
 * Short codes printed under every QR (5 characters, no 0/O/1/I/L), for customers who can't or
 * don't want to scan: they type it at restocool.com/c. seat_id null = the restaurant's main code.
 * Codes are global (one namespace for all restaurants), so the code alone finds the restaurant.
 */
export const accessCodes = pgTable(
  "access_codes",
  {
    code: text("code").primaryKey(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    seatId: uuid("seat_id").references(() => seats.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("access_codes_restaurant_idx").on(t.restaurantId),
    uniqueIndex("access_codes_seat_uq").on(t.seatId),
    uniqueIndex("access_codes_main_uq").on(t.restaurantId).where(sql`${t.seatId} is null`),
  ],
);
