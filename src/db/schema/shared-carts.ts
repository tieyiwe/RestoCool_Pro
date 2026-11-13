import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { orders } from "./orders";
import { restaurants } from "./restaurants";

/** One dish line in a shared selection (same shape as the customer's cart). */
export type SharedLine = { key: string; itemId: string; variantId: string | null; optionIds: string[]; qty: number; note?: string };

/**
 * « Sélection partagée »: the person who started a selection (the host) shares a link (WhatsApp…)
 * with the people at the same table or room. Each guest adds their own dishes and says when they
 * are done; only the host sends the order (or shows it to the server, takeaway…).
 * The link carries a random token: only its SHA-256 is stored. Open for 6 h at most.
 */
export const sharedCarts = pgTable(
  "shared_carts",
  {
    id: id(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    /** SHA-256 of the host's device id. */
    hostDeviceHash: text("host_device_hash").notNull(),
    hostName: text("host_name"),
    status: text("status").$type<"open" | "sent" | "closed">().notNull().default("open"),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("shared_carts_token_uq").on(t.tokenHash), index("shared_carts_host_idx").on(t.restaurantId, t.hostDeviceHash, t.status)],
);

/** A guest of a shared selection: their name, their dishes, and whether they are done choosing. */
export const sharedCartMembers = pgTable(
  "shared_cart_members",
  {
    id: id(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => sharedCarts.id, { onDelete: "cascade" }),
    deviceHash: text("device_hash").notNull(),
    name: text("name"),
    lines: jsonb("lines").$type<SharedLine[]>().notNull().default([]),
    done: boolean("done").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("shared_cart_members_uq").on(t.cartId, t.deviceHash)],
);
