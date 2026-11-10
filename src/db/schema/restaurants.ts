import { boolean, index, jsonb, smallint, text, time, timestamp, uniqueIndex, uuid, pgTable, type AnyPgColumn } from "drizzle-orm/pg-core";
import { id, timestamps, type I18nText } from "./_shared";
import { memberRoleEnum, planEnum, planStatusEnum, themeEnum } from "./enums";

export type RestaurantSettings = {
  /** Set when the owner finishes (or skips) the setup wizard. */
  onboardedAt?: string;
  seatingModes?: Array<"table" | "room" | "area" | "counter" | "takeaway" | "delivery">;
  qrStrategy?: "per_seat" | "generic";
  orderValidation?: "direct" | "server_confirms";
  enabledLocales?: string[];
  features?: Partial<Record<FeatureFlag, boolean>>;
  inactivity?: { warnAfterSec: number; releaseAfterSec: number };
  /** Front desk timers: an open order turns orange, then red, after these many minutes. */
  serviceDelays?: { warnMin: number; lateMin: number };
};

export const FEATURE_FLAGS = ["welcomeScreen", "fortuneCookie", "takeawayWhatsapp", "share", "localBadge"] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export const restaurants = pgTable(
  "restaurants",
  {
    id: id(),
    /**
     * Multi-branch: a branch is a full restaurant pointing at its head restaurant.
     * Tenant scoping stays one restaurant_id everywhere.
     */
    parentRestaurantId: uuid("parent_restaurant_id").references((): AnyPgColumn => restaurants.id, { onDelete: "set null" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    /** Short presentation shown under the name on the public menu. */
    description: jsonb("description").$type<I18nText>(),
    legalName: text("legal_name"),
    logoUrl: text("logo_url"),
    coverUrl: text("cover_url"),
    theme: themeEnum("theme").notNull().default("warm"),
    accentColor: text("accent_color").notNull().default("#0F6B3E"),
    phones: text("phones").array().notNull().default([]),
    whatsapp: text("whatsapp"),
    orangeMoney: text("orange_money"),
    moovMoney: text("moov_money"),
    address: text("address"),
    city: text("city").notNull().default("Ouagadougou"),
    gmapsUrl: text("gmaps_url"),
    timezone: text("timezone").notNull().default("Africa/Ouagadougou"),
    defaultLocale: text("default_locale").notNull().default("fr"),
    settings: jsonb("settings").$type<RestaurantSettings>().notNull().default({}),
    plan: planEnum("plan").notNull().default("pro"),
    planStatus: planStatusEnum("plan_status").notNull().default("trial"),
    planExpiresAt: timestamp("plan_expires_at", { withTimezone: true }),
    published: boolean("published").notNull().default(false),
    poweredBadge: boolean("powered_badge").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("restaurants_slug_uq").on(t.slug), index("restaurants_parent_idx").on(t.parentRestaurantId)],
);

/**
 * Who can sign in to which restaurant, and with which RestoCool role.
 * App-managed tenants: Clerk only proves identity (clerk_user_id); restaurant
 * membership lives here, not in Clerk Organizations.
 */
export const members = pgTable(
  "members",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    clerkUserId: text("clerk_user_id").notNull(),
    email: text("email"),
    name: text("name"),
    role: memberRoleEnum("role").notNull().default("manager"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("members_restaurant_idx").on(t.restaurantId),
    index("members_user_idx").on(t.clerkUserId),
    uniqueIndex("members_restaurant_user_uq").on(t.restaurantId, t.clerkUserId),
  ],
);

export const openingHours = pgTable(
  "opening_hours",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    /** 0 = Sunday … 6 = Saturday */
    weekday: smallint("weekday").notNull(),
    opens: time("opens").notNull(),
    /** May be earlier than `opens` when service runs past midnight. */
    closes: time("closes").notNull(),
    ...timestamps,
  },
  (t) => [index("opening_hours_restaurant_idx").on(t.restaurantId)],
);
