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
