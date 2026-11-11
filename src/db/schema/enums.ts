import { pgEnum } from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan", ["gratuit", "pro", "business"]);
export const planStatusEnum = pgEnum("plan_status", ["trial", "active", "past_due", "suspended"]);
export const themeEnum = pgEnum("menu_theme", ["lacquer", "light", "warm"]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "manager", "server", "kitchen", "cashier"]);
/** « seat »: a bus seat (transport businesses), always part of a bus (`seats.bus_id`). */
export const seatTypeEnum = pgEnum("seat_type", ["table", "room", "area", "counter", "takeaway", "delivery", "seat"]);
export const stationEnum = pgEnum("station", ["grill", "wok", "kitchen", "drinks", "desserts"]);
export const actorTypeEnum = pgEnum("actor_type", ["member", "staff", "superadmin", "customer", "system"]);
export const orderStatusEnum = pgEnum("order_status", ["sent", "confirmed", "preparing", "ready", "served", "paid", "cancelled"]);
export const orderItemStatusEnum = pgEnum("order_item_status", ["pending", "preparing", "ready", "served", "cancelled"]);
export const orderSourceEnum = pgEnum("order_source", ["customer", "staff"]);
