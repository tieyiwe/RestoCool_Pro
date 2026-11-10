import { boolean, index, integer, jsonb, smallint, text, timestamp, uuid, pgTable } from "drizzle-orm/pg-core";
import { id, timestamps, type I18nText } from "./_shared";
import { stationEnum } from "./enums";
import { restaurants } from "./restaurants";

export type TimeWindow = { from: string; to: string; weekdays?: number[] } | null;

export const menuCategories = pgTable(
  "menu_categories",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    name: jsonb("name").$type<I18nText>().notNull(),
    sort: integer("sort").notNull().default(0),
    active: boolean("active").notNull().default(true),
    timeWindow: jsonb("time_window").$type<TimeWindow>(),
    ...timestamps,
  },
  (t) => [index("menu_categories_restaurant_idx").on(t.restaurantId)],
);

export const menuItems = pgTable(
  "menu_items",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => menuCategories.id, { onDelete: "cascade" }),
    code: text("code"),
    name: jsonb("name").$type<I18nText>().notNull(),
    description: jsonb("description").$type<I18nText>(),
    /** Integer FCFA. NULL means "Sur demande" (never shown as 0 F). */
    price: integer("price"),
    spicy: smallint("spicy").notNull().default(0),
    tags: text("tags").array().notNull().default([]),
    station: stationEnum("station").notNull().default("kitchen"),
    photoUrl: text("photo_url"),
    thumbUrl: text("thumb_url"),
    available: boolean("available").notNull().default(true),
    soldOutUntil: timestamp("sold_out_until", { withTimezone: true }),
    /** Short note shown to customers while the dish is « Épuisé » (« De retour demain »). */
    unavailableNote: text("unavailable_note"),
    sort: integer("sort").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("menu_items_restaurant_idx").on(t.restaurantId), index("menu_items_category_idx").on(t.categoryId)],
);

export const menuItemVariants = pgTable(
  "menu_item_variants",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull().references(() => menuItems.id, { onDelete: "cascade" }),
    name: jsonb("name").$type<I18nText>().notNull(),
    price: integer("price").notNull(),
    sort: integer("sort").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("menu_item_variants_restaurant_idx").on(t.restaurantId), index("menu_item_variants_item_idx").on(t.itemId)],
);

export const menuItemOptions = pgTable(
  "menu_item_options",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull().references(() => menuItems.id, { onDelete: "cascade" }),
    group: jsonb("group").$type<I18nText>().notNull(),
    name: jsonb("name").$type<I18nText>().notNull(),
    priceDelta: integer("price_delta").notNull().default(0),
    maxSelect: smallint("max_select").notNull().default(1),
    sort: integer("sort").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("menu_item_options_restaurant_idx").on(t.restaurantId), index("menu_item_options_item_idx").on(t.itemId)],
);

export const fortunes = pgTable(
  "fortunes",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    text: jsonb("text").$type<I18nText>().notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("fortunes_restaurant_idx").on(t.restaurantId)],
);
