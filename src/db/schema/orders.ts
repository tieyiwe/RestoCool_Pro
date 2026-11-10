import { boolean, date, index, integer, jsonb, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps, type I18nText } from "./_shared";
import { orderItemStatusEnum, orderSourceEnum, orderStatusEnum, seatTypeEnum, stationEnum } from "./enums";
import { menuItems } from "./menu";
import { restaurants } from "./restaurants";
import { seats, tableSessions } from "./seating";

/**
 * Orders. Prices are computed on the server from the menu and frozen here (snapshots), so later
 * menu edits never change an order. `number` restarts at 1 every day (Africa/Ouagadougou = UTC).
 */
export const orders = pgTable(
  "orders",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => tableSessions.id, { onDelete: "set null" }),
    seatId: uuid("seat_id").references(() => seats.id, { onDelete: "set null" }),
    /** Seat at the time of the order (the seat may be renamed or deleted later). */
    seatType: seatTypeEnum("seat_type"),
    seatLabel: text("seat_label"),
    businessDate: date("business_date", { mode: "string" }).notNull(),
    number: integer("number").notNull(),
    source: orderSourceEnum("source").notNull().default("customer"),
    customerDeviceId: text("customer_device_id"),
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),
    deliveryAddress: text("delivery_address"),
    status: orderStatusEnum("status").notNull().default("sent"),
    /** Validation mode in force when the order was sent: direct | server_confirms. */
    validationMode: text("validation_mode").$type<"direct" | "server_confirms">().notNull(),
    assignedStaffId: uuid("assigned_staff_id"),
    /** Integer FCFA, priced items only. */
    subtotal: integer("subtotal").notNull().default(0),
    /** At least one « sur demande » item: the final price is set by the restaurant. */
    hasOnRequest: boolean("has_on_request").notNull().default(false),
    note: text("note"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    preparingAt: timestamp("preparing_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    servedAt: timestamp("served_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledReason: text("cancelled_reason"),
    /** Who made the last status change: "member:<userId>", "staff:<id>", "customer", "system". */
    updatedBy: text("updated_by"),
    ...timestamps,
  },
  (t) => [
    index("orders_restaurant_status_idx").on(t.restaurantId, t.status),
    index("orders_session_idx").on(t.sessionId),
    index("orders_device_idx").on(t.restaurantId, t.customerDeviceId),
    uniqueIndex("orders_restaurant_day_number_uq").on(t.restaurantId, t.businessDate, t.number),
  ],
);

export type OrderOptionSnapshot = { id: string; group: I18nText; name: I18nText; priceDelta: number };

export const orderItems = pgTable(
  "order_items",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => menuItems.id, { onDelete: "set null" }),
    variantId: uuid("variant_id"),
    code: text("code"),
    nameSnapshot: jsonb("name_snapshot").$type<I18nText>().notNull(),
    variantName: jsonb("variant_name").$type<I18nText>(),
    options: jsonb("options").$type<OrderOptionSnapshot[]>().notNull().default([]),
    /** Integer FCFA per unit, variant and options included. NULL = « sur demande ». */
    unitPrice: integer("unit_price"),
    qty: smallint("qty").notNull(),
    note: text("note"),
    station: stationEnum("station").notNull().default("kitchen"),
    status: orderItemStatusEnum("status").notNull().default("pending"),
    sort: smallint("sort").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("order_items_restaurant_idx").on(t.restaurantId), index("order_items_order_idx").on(t.orderId)],
);
