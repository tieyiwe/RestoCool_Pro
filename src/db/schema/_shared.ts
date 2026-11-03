import { timestamp, uuid } from "drizzle-orm/pg-core";

/** Translated text. French is always required; other locales are optional. */
export type I18nText = { fr: string; en?: string; zh?: string } & Partial<Record<string, string>>;

export const id = () => uuid("id").primaryKey().defaultRandom();

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
