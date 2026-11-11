import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, timestamps } from "./_shared";
import { members, restaurants } from "./restaurants";
import { buses } from "./seating";

/**
 * An itinerary of a transport business (« Ouagadougou → Bobo-Dioulasso »). Hostesses are assigned
 * to itineraries (route_assignments); a trip runs on one itinerary.
 */
export const routes = pgTable(
  "routes",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    origin: text("origin").notNull(),
    destination: text("destination").notNull(),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("routes_restaurant_idx").on(t.restaurantId), uniqueIndex("routes_restaurant_od_uq").on(t.restaurantId, t.origin, t.destination)],
);

/** Which hostesses (or other personnel) work on which itinerary. */
export const routeAssignments = pgTable(
  "route_assignments",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    routeId: uuid("route_id").notNull().references(() => routes.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("route_assignments_restaurant_idx").on(t.restaurantId), uniqueIndex("route_assignments_uq").on(t.routeId, t.memberId)],
);

/**
 * One departure of a bus (transport businesses): the hostess starts it (« Ouaga → Bobo, 07:00 »),
 * travelers order during it, and closing it frees every seat for the next departure. At most one
 * open trip per bus.
 */
export const trips = pgTable(
  "trips",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    busId: uuid("bus_id").notNull().references(() => buses.id, { onDelete: "cascade" }),
    routeId: uuid("route_id").references((): AnyPgColumn => routes.id, { onDelete: "set null" }),
    /** « Ouagadougou → Bobo-Dioulasso », frozen when the trip starts (the itinerary may change later). */
    route: text("route").notNull(),
    departureAt: timestamp("departure_at", { withTimezone: true }).notNull(),
    status: text("status").$type<"open" | "closed">().notNull().default("open"),
    openedBy: uuid("opened_by").references(() => members.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: uuid("closed_by").references(() => members.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("trips_restaurant_idx").on(t.restaurantId, t.departureAt),
    uniqueIndex("trips_one_open_per_bus").on(t.busId).where(sql`${t.status} = 'open'`),
  ],
);
