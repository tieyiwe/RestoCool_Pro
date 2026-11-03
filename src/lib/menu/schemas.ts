import { z } from "zod";

/** Shared (client + server) validation for the menu manager. */
const text = (max: number) => z.string().trim().max(max);

export const I18nRequired = z.object({
  fr: text(120).min(1),
  en: text(120).optional().default(""),
  zh: text(120).optional().default(""),
});
export const I18nOptional = z.object({
  fr: text(600).optional().default(""),
  en: text(600).optional().default(""),
  zh: text(600).optional().default(""),
});

export const ITEM_TAGS = ["new", "chef", "vegetarian", "local", "peanuts", "shellfish", "eggs"] as const;
export const STATIONS = ["kitchen", "grill", "wok", "drinks", "desserts"] as const;

const Hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const CategoryInput = z.object({
  name: I18nRequired,
  active: z.boolean().default(true),
  timeWindow: z.object({ from: Hhmm, to: Hhmm }).nullable().default(null),
});
export type CategoryInput = z.infer<typeof CategoryInput>;

/** FCFA: whole number, up to 10 million. */
const Price = z.number().int().min(0).max(10_000_000);

export const VariantInput = z.object({ name: I18nRequired, price: Price });
export const OptionInput = z.object({
  group: I18nRequired,
  name: I18nRequired,
  priceDelta: z.number().int().min(-1_000_000).max(1_000_000).default(0),
});

/** Photo URLs must come from our own media route (or the seeded demo images). */
const PhotoUrl = z
  .string()
  .regex(/^\/(api\/media\/r\/[0-9a-f-]{36}\/[A-Za-z0-9_-]+(-t)?\.webp|demo\/item-[\w-]+\.svg)$/)
  .nullable()
  .default(null);

export const ItemInput = z.object({
  categoryId: z.uuid(),
  code: text(12).optional().default(""),
  name: I18nRequired,
  description: I18nOptional,
  /** null = « Sur demande » (never shown as 0 F). Ignored when variants exist. */
  price: Price.nullable(),
  variants: z.array(VariantInput).max(12).default([]),
  options: z.array(OptionInput).max(20).default([]),
  spicy: z.number().int().min(0).max(2).default(0),
  tags: z.array(z.enum(ITEM_TAGS)).max(ITEM_TAGS.length).default([]),
  station: z.enum(STATIONS).default("kitchen"),
  photoUrl: PhotoUrl,
  thumbUrl: PhotoUrl,
  available: z.boolean().default(true),
});
export type ItemInput = z.infer<typeof ItemInput>;
export type ItemFormValues = z.input<typeof ItemInput>;
