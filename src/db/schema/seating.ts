import { boolean, index, integer, jsonb, smallint, text, uniqueIndex, uuid, pgTable } from "drizzle-orm/pg-core";
import { id, timestamps, type I18nText } from "./_shared";
import { seatTypeEnum } from "./enums";
import { restaurants } from "./restaurants";

export const areas = pgTable(
  "areas",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    name: jsonb("name").$type<I18nText>().notNull(),
    sort: integer("sort").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("areas_restaurant_idx").on(t.restaurantId)],
);

export const seats = pgTable(
  "seats",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    type: seatTypeEnum("type").notNull(),
    label: text("label").notNull(),
    areaId: uuid("area_id").references(() => areas.id, { onDelete: "set null" }),
    capacity: smallint("capacity"),
    /** Random (>=128 bit) token printed in the seat's QR code. */
    qrToken: text("qr_token").notNull(),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("seats_restaurant_idx").on(t.restaurantId),
    uniqueIndex("seats_qr_token_uq").on(t.qrToken),
    uniqueIndex("seats_restaurant_type_label_uq").on(t.restaurantId, t.type, t.label),
  ],
);
