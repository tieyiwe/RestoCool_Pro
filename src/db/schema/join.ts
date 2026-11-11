import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { jobRoles, members, restaurants } from "./restaurants";

/**
 * « Rejoindre l'équipe »: a person scans the team QR the owner shows, types their full name,
 * phone and a PIN, and waits. The owner (or a manager) accepts with a role (the person then
 * becomes a member with the next matricule) or declines. The person's phone follows the
 * request with a secret kept in an http-only cookie (only its hash is stored).
 */
export const joinRequests = pgTable(
  "join_requests",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    pinHash: text("pin_hash").notNull(),
    status: text("status").$type<"pending" | "accepted" | "declined">().notNull().default("pending"),
    secretHash: text("secret_hash").notNull(),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
    jobRoleId: uuid("job_role_id").references(() => jobRoles.id, { onDelete: "set null" }),
    decidedBy: uuid("decided_by").references(() => members.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("join_requests_restaurant_idx").on(t.restaurantId, t.status)],
);
