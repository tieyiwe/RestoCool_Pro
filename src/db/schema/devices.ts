import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { members, restaurants } from "./restaurants";

/**
 * A tablet or phone the owner/manager authorised for the business (« Autoriser cet appareil »).
 * The browser keeps a long random token in an http-only cookie; only its SHA-256 is stored.
 * On this device, personnel log in with their PIN (staff_sessions). Revoking ends everything.
 */
export const devices = pgTable(
  "devices",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    authorizedBy: uuid("authorized_by").references(() => members.id, { onDelete: "set null" }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("devices_restaurant_idx").on(t.restaurantId)],
);

/**
 * One person working on an authorised device after typing their PIN. Ends at the end of the
 * shift (expires_at), after the idle time without activity, on « Verrouiller », or when the
 * device is revoked. The cookie holds a random token; only its SHA-256 is stored.
 */
export const staffSessions = pgTable(
  "staff_sessions",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id").notNull().references(() => devices.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("staff_sessions_device_idx").on(t.deviceId), index("staff_sessions_member_idx").on(t.memberId)],
);
