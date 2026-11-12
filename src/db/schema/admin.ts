import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, timestamps, type I18nText } from "./_shared";
import { members, restaurants } from "./restaurants";

/**
 * People TIBLOGICS lets into the console besides the owners listed in SUPERADMIN_EMAILS.
 * Each has its own permissions (src/lib/admin/access.ts); they sign in with this verified email.
 */
export const adminCollaborators = pgTable("admin_collaborators", {
  id: id(),
  /** Lower case. */
  email: text("email").notNull().unique(),
  name: text("name"),
  perms: text("perms").array().notNull().default([]),
  active: boolean("active").notNull().default(true),
  addedBy: text("added_by").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  ...timestamps,
});

export type MessageAudience = {
  /** Who in each business sees it. */
  to: "owners" | "managers" | "everyone";
  restaurantIds?: string[];
  plans?: string[];
  kinds?: string[];
  cities?: string[];
};

/** Messages and in-app notifications from TIBLOGICS to businesses (news, new features, maintenance…). */
export const platformMessages = pgTable(
  "platform_messages",
  {
    id: id(),
    kind: text("kind").notNull(),
    title: jsonb("title").$type<I18nText>().notNull(),
    body: jsonb("body").$type<I18nText>().notNull(),
    link: text("link"),
    audience: jsonb("audience").$type<MessageAudience>().notNull(),
    /** Shown as a pop-up the next time the person opens the app (new features). */
    popup: boolean("popup").notNull().default(false),
    /** Also emailed to the owners (verified emails). */
    email: boolean("email").notNull().default(false),
    emailedCount: integer("emailed_count").notNull().default(0),
    recipients: integer("recipients").notNull().default(0),
    createdBy: text("created_by").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("platform_messages_created_idx").on(t.createdAt)],
);

export const platformMessageReads = pgTable(
  "platform_message_reads",
  {
    messageId: uuid("message_id").notNull().references(() => platformMessages.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("platform_message_reads_uq").on(t.messageId, t.memberId)],
);

/** How much each person uses the app, per day (heartbeat every minute while a screen is open). */
export const appUsage = pgTable(
  "app_usage",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    minutes: integer("minutes").notNull().default(0),
    views: integer("views").notNull().default(0),
    lastPath: text("last_path"),
    /** « account » (signed in) or « pin » (restaurant tablet). */
    via: text("via").notNull().default("account"),
    lastAt: timestamp("last_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("app_usage_member_day_uq").on(t.restaurantId, t.memberId, t.day),
    index("app_usage_last_idx").on(t.lastAt),
    index("app_usage_day_idx").on(t.day),
  ],
);

/** « Signaler un problème »: requests from businesses to TIBLOGICS, with urgency and replies. */
export const supportRequests = pgTable(
  "support_requests",
  {
    id: id(),
    /** Short reference shown to both sides, « D-000123 ». */
    number: integer("number").generatedAlwaysAsIdentity().notNull(),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "set null" }),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "set null" }),
    /** « app » (signed in) or « public » (locked-out person, /aide). */
    source: text("source").notNull(),
    name: text("name").notNull(),
    role: text("role"),
    contact: text("contact"),
    /** What the person typed as numéro RC (public form). */
    rcCode: text("rc_code"),
    category: text("category").notNull(),
    /** low | medium | high */
    urgency: text("urgency").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    pageUrl: text("page_url"),
    userAgent: text("user_agent"),
    /** new | in_progress | waiting | resolved */
    status: text("status").notNull().default("new"),
    assignedTo: text("assigned_to"),
    /** The business has an admin reply it has not opened yet. */
    unreadForBusiness: boolean("unread_for_business").notNull().default(false),
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [index("support_requests_status_idx").on(t.status, t.createdAt), index("support_requests_restaurant_idx").on(t.restaurantId, t.createdAt)],
);

export const supportMessages = pgTable(
  "support_messages",
  {
    id: id(),
    requestId: uuid("request_id").notNull().references(() => supportRequests.id, { onDelete: "cascade" }),
    /** business | admin */
    from: text("from").notNull(),
    author: text("author").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("support_messages_request_idx").on(t.requestId, t.createdAt)],
);

/**
 * Account recovery: TIBLOGICS checks who is calling (numéro RC + business details) before
 * unlocking a PIN, setting a new one, or handing the business to a new owner email.
 */
export const recoveryCases = pgTable(
  "recovery_cases",
  {
    id: id(),
    restaurantId: uuid("restaurant_id").notNull().references(() => restaurants.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").references(() => supportRequests.id, { onDelete: "set null" }),
    callerName: text("caller_name").notNull(),
    callerPhone: text("caller_phone"),
    /** What the caller said and whether it matched (never the business's own data). */
    checks: jsonb("checks").$type<Record<string, boolean>>().notNull(),
    score: integer("score").notNull(),
    verified: boolean("verified").notNull(),
    by: text("by").notNull(),
    /** Actions are allowed until then (30 minutes). */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    actions: jsonb("actions").$type<Array<{ action: string; at: string; target?: string }>>().notNull().default([]),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("recovery_cases_restaurant_idx").on(t.restaurantId, t.createdAt)],
);

/**
 * Platform traffic, one row per minute × audience × device: how many people had a RestoCool
 * screen open (written every minute from the live presence, see src/lib/usage/presence.ts).
 */
export const trafficMinutes = pgTable(
  "traffic_minutes",
  {
    minute: timestamp("minute", { withTimezone: true }).notNull(),
    /** owner | manager | staff | customer | visitor */
    audience: text("audience").notNull(),
    /** phone | tablet | desktop */
    device: text("device").notNull(),
    n: integer("n").notNull(),
  },
  (t) => [uniqueIndex("traffic_minutes_uq").on(t.minute, t.audience, t.device)],
);

/** Distinct people per day (an anonymous, hashed key — never a name, phone or IP). */
export const trafficVisitors = pgTable(
  "traffic_visitors",
  {
    day: date("day").notNull(),
    visitor: text("visitor").notNull(),
    audience: text("audience").notNull(),
    device: text("device").notNull(),
    os: text("os").notNull(),
    standalone: boolean("standalone").notNull().default(false),
    restaurantId: uuid("restaurant_id").references(() => restaurants.id, { onDelete: "set null" }),
  },
  (t) => [uniqueIndex("traffic_visitors_uq").on(t.day, t.visitor, t.audience), index("traffic_visitors_restaurant_idx").on(t.restaurantId, t.day)],
);
