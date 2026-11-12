import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id } from "./_shared";
import { restaurants } from "./restaurants";

/**
 * Emails the platform sent (welcome, notifications): who, what and whether it left. One row per
 * business and kind, so a welcome email is never sent twice. The content itself is not stored.
 */
export const emailLog = pgTable(
  "email_log",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    to: text("to").notNull(),
    status: text("status").$type<"pending" | "sent" | "skipped" | "failed">().notNull().default("pending"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("email_log_restaurant_kind_uq").on(t.restaurantId, t.kind), index("email_log_created_idx").on(t.createdAt)],
);
