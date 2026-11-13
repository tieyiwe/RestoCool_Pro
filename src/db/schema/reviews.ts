import { check, index, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, timestamps } from "./_shared";
import { orders } from "./orders";
import { restaurants } from "./restaurants";

/**
 * Customer reviews of a business. Only a customer who was served can leave one (one per order,
 * from the phone that ordered). The business may hide a review or delete it from its own view;
 * nothing is ever erased: the platform console keeps every review with its state and who changed it.
 *  status: visible (on the public page) | hidden (by the business) | deleted (by the business)
 */
export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    restaurantId: uuid("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    /** SHA-256 of the customer's anonymous device id (never the id itself). */
    deviceHash: text("device_hash").notNull(),
    rating: smallint("rating").notNull(),
    comment: text("comment"),
    /** First name the customer chose to show (optional). */
    authorName: text("author_name"),
    /** Language the review was written in (fr, en, zh). */
    lang: text("lang").notNull().default("fr"),
    status: text("status").$type<"visible" | "hidden" | "deleted">().notNull().default("visible"),
    /** Who changed the status last (member id or user id) and when. */
    statusBy: text("status_by"),
    statusAt: timestamp("status_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("reviews_restaurant_idx").on(t.restaurantId, t.status, t.createdAt),
    uniqueIndex("reviews_order_uq").on(t.orderId),
    index("reviews_created_idx").on(t.createdAt),
    check("reviews_rating_range", sql`${t.rating} between 1 and 5`),
  ],
);
export type Review = typeof reviews.$inferSelect;
