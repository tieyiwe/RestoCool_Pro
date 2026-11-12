import { boolean, index, inet, integer, jsonb, text, timestamp, uuid, pgTable } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";
import { actorTypeEnum, planEnum, planStatusEnum } from "./enums";
import { restaurants } from "./restaurants";

/** Append-only log of who did what. restaurant_id is NULL for platform-level actions. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "set null" }),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    data: jsonb("data").$type<Record<string, unknown>>(),
    ip: inet("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_restaurant_idx").on(t.restaurantId, t.createdAt)],
);

export const planEvents = pgTable(
  "plan_events",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    fromPlan: planEnum("from_plan"),
    toPlan: planEnum("to_plan").notNull(),
    fromStatus: planStatusEnum("from_status"),
    toStatus: planStatusEnum("to_status").notNull(),
    /** Integer FCFA. */
    amount: integer("amount"),
    method: text("method"),
    reference: text("reference"),
    bySuperadmin: text("by_superadmin"),
    automatic: boolean("automatic").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("plan_events_restaurant_idx").on(t.restaurantId)],
);

/**
 * Platform-wide settings the super admin changes without a deploy (launch offer, announcement…).
 * One row per key; the value's shape is defined in src/lib/platform/settings.ts.
 */
export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Server errors, grouped by fingerprint (same message + place): the super admin's error list.
 * No paid monitoring: written by the error sink (instrumentation.ts) and log.error.
 */
export const appErrors = pgTable(
  "app_errors",
  {
    id: id(),
    fingerprint: text("fingerprint").notNull().unique(),
    message: text("message").notNull(),
    where: text("where"),
    sample: jsonb("sample").$type<Record<string, unknown>>(),
    count: integer("count").notNull().default(1),
    firstAt: timestamp("first_at", { withTimezone: true }).notNull().defaultNow(),
    lastAt: timestamp("last_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("app_errors_last_idx").on(t.lastAt)],
);

/** Internal notes TIBLOGICS keeps about a business (calls, promises, payments expected…). */
export const adminNotes = pgTable(
  "admin_notes",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    by: text("by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("admin_notes_restaurant_idx").on(t.restaurantId, t.createdAt)],
);
