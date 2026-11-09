import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import type { TenantRepo } from "@/db/repos/tenant";
import { FEATURE_FLAGS, menuCategories, menuItems, openingHours, restaurants, type RestaurantSettings } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/can";
import { accentIsReadable } from "@/lib/color";
import { isUniqueViolation } from "@/lib/errors";
import { normalizeBfPhone } from "@/lib/format";
import { hasFeature } from "@/lib/plan";
import { RESERVED_SLUGS, slugify } from "@/lib/slug";
import { syncSingletonSeats } from "@/lib/seating/admin";

export type SettingsCtx = { db: DB; actor: Actor; repo: TenantRepo };
export type SettingsError =
  | "invalid"
  | "slug_taken"
  | "slug_reserved"
  | "phone_invalid"
  | "contrast"
  | "badge_plan"
  | "publish_empty"
  | "qr_plan";
export class SettingsValidationError extends Error {
  constructor(public readonly code: SettingsError) {
    super(code);
  }
}

const opt = (max: number) => z.string().trim().max(max).optional().default("");
const Hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const ProfileInput = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().min(2).max(48),
  description: z.object({ fr: opt(240), en: opt(240), zh: opt(240) }),
  city: z.string().trim().min(2).max(60),
  address: opt(200),
  gmapsUrl: z.union([z.literal(""), z.url().max(500).refine((u) => u.startsWith("https://"))]).default(""),
});

export const ContactsInput = z.object({
  phones: z.array(z.string().trim().max(30)).max(3).default([]),
  whatsapp: opt(30),
  orangeMoney: opt(30),
  moovMoney: opt(30),
});

export const HoursInput = z.array(z.object({ weekday: z.number().int().min(0).max(6), open: z.boolean(), opens: Hhmm, closes: Hhmm })).length(7);

export const SEATING_MODES = ["table", "area", "room", "counter", "takeaway", "delivery"] as const;
export const ServiceInput = z.object({
  seatingModes: z.array(z.enum(SEATING_MODES)).min(1),
  qrStrategy: z.enum(["per_seat", "generic"]),
  orderValidation: z.enum(["direct", "server_confirms"]),
  enabledLocales: z.array(z.enum(["fr", "en", "zh"])).default(["fr"]),
  /** Inactivity release in picker mode (seconds). */
  inactivity: z.object({ warnAfterSec: z.number().int().min(60).max(3600), releaseAfterSec: z.number().int().min(10).max(600) }).optional(),
});

const OwnMedia = z.union([z.literal(""), z.string().regex(/^\/api\/media\/r\/[0-9a-f-]{36}\/[A-Za-z0-9_-]+(-t)?\.(?:webp|jpg)$/)]).default("");
export const AppearanceInput = z.object({
  theme: z.enum(["lacquer", "light", "warm"]),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  logoUrl: OwnMedia,
  coverUrl: OwnMedia,
});

export const FeaturesInput = z.object({
  features: z.partialRecord(z.enum(FEATURE_FLAGS), z.boolean()),
  poweredBadge: z.boolean(),
});

async function current(ctx: SettingsCtx) {
  const r = await ctx.repo.restaurant.get();
  if (!r) throw new SettingsValidationError("invalid");
  return r;
}

async function update(ctx: SettingsCtx, values: Partial<typeof restaurants.$inferInsert>, action: string) {
  const rid = ctx.repo.restaurantId;
  await ctx.db.update(restaurants).set(values).where(eq(restaurants.id, rid));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: rid, action, entity: "restaurant", entityId: rid, data: { fields: Object.keys(values) } });
}

async function mergeSettings(ctx: SettingsCtx, patch: Partial<RestaurantSettings>, action: string) {
  const r = await current(ctx);
  await update(ctx, { settings: { ...r.settings, ...patch } }, action);
}

const i18nOrNull = (t: { fr: string; en: string; zh: string }) =>
  t.fr ? { fr: t.fr, ...(t.en ? { en: t.en } : {}), ...(t.zh ? { zh: t.zh } : {}) } : null;

export async function saveProfile(ctx: SettingsCtx, input: z.input<typeof ProfileInput>) {
  const p = ProfileInput.safeParse(input);
  if (!p.success) throw new SettingsValidationError("invalid");
  const slug = slugify(p.data.slug);
  if (RESERVED_SLUGS.has(slug)) throw new SettingsValidationError("slug_reserved");
  const taken = await ctx.db.query.restaurants.findFirst({
    where: and(eq(restaurants.slug, slug), ne(restaurants.id, ctx.repo.restaurantId)),
    columns: { id: true },
  });
  if (taken) throw new SettingsValidationError("slug_taken");
  try {
    await update(
      ctx,
      {
        name: p.data.name,
        slug,
        description: i18nOrNull(p.data.description),
        city: p.data.city,
        address: p.data.address || null,
        gmapsUrl: p.data.gmapsUrl || null,
      },
      "settings.profile",
    );
  } catch (err) {
    // Another restaurant took the slug between the check and the update (unique index).
    if (isUniqueViolation(err)) throw new SettingsValidationError("slug_taken");
    throw err;
  }
}


export async function saveContacts(ctx: SettingsCtx, input: z.input<typeof ContactsInput>) {
  const p = ContactsInput.safeParse(input);
  if (!p.success) throw new SettingsValidationError("invalid");
  const norm = (v: string) => {
    if (!v) return null;
    const n = normalizeBfPhone(v);
    if (!n) throw new SettingsValidationError("phone_invalid");
    return n;
  };
  await update(
    ctx,
    {
      phones: p.data.phones.filter(Boolean).map((v) => norm(v)!),
      whatsapp: norm(p.data.whatsapp),
      orangeMoney: norm(p.data.orangeMoney),
      moovMoney: norm(p.data.moovMoney),
    },
    "settings.contacts",
  );
}

export async function saveHours(ctx: SettingsCtx, input: z.input<typeof HoursInput>) {
  const p = HoursInput.safeParse(input);
  if (!p.success) throw new SettingsValidationError("invalid");
  const rid = ctx.repo.restaurantId;
  await ctx.db.transaction(async (tx) => {
    await tx.delete(openingHours).where(eq(openingHours.restaurantId, rid));
    const rows = p.data.filter((d) => d.open).map((d) => ({ restaurantId: rid, weekday: d.weekday, opens: d.opens, closes: d.closes }));
    if (rows.length) await tx.insert(openingHours).values(rows);
    await writeAudit(tx, ctx.actor, { restaurantId: rid, action: "settings.hours", entity: "restaurant", entityId: rid });
  });
}

export async function saveService(ctx: SettingsCtx, input: z.input<typeof ServiceInput>) {
  const p = ServiceInput.safeParse(input);
  if (!p.success) throw new SettingsValidationError("invalid");
  const enabledLocales = Array.from(new Set(["fr", ...p.data.enabledLocales]));
  const r = await current(ctx);
  // One QR per table/room needs Pro or Business; Gratuit has one generic QR.
  if (p.data.qrStrategy === "per_seat" && !hasFeature(r, "qrPerSeat")) throw new SettingsValidationError("qr_plan");
  await mergeSettings(
    ctx,
    { ...p.data, enabledLocales, inactivity: p.data.inactivity ?? r.settings.inactivity },
    "settings.service",
  );
  await syncSingletonSeats(ctx.db, ctx.repo.restaurantId, p.data.seatingModes);
}

export async function saveAppearance(ctx: SettingsCtx, input: z.input<typeof AppearanceInput>) {
  const p = AppearanceInput.safeParse(input);
  if (!p.success) throw new SettingsValidationError("invalid");
  if (!accentIsReadable(p.data.accentColor, p.data.theme)) throw new SettingsValidationError("contrast");
  const own = `/api/media/r/${ctx.repo.restaurantId}/`;
  for (const u of [p.data.logoUrl, p.data.coverUrl]) if (u && !u.startsWith(own)) throw new SettingsValidationError("invalid");
  await update(
    ctx,
    { theme: p.data.theme, accentColor: p.data.accentColor.toUpperCase(), logoUrl: p.data.logoUrl || null, coverUrl: p.data.coverUrl || null },
    "settings.appearance",
  );
}

export async function saveFeatures(ctx: SettingsCtx, input: z.input<typeof FeaturesInput>) {
  const p = FeaturesInput.safeParse(input);
  if (!p.success) throw new SettingsValidationError("invalid");
  const r = await current(ctx);
  // Hiding the RestoCool badge is a Business plan feature.
  if (!p.data.poweredBadge && !hasFeature(r, "hideBadge")) throw new SettingsValidationError("badge_plan");
  await update(ctx, { settings: { ...r.settings, features: { ...r.settings.features, ...p.data.features } }, poweredBadge: p.data.poweredBadge }, "settings.features");
}

/** Publishing needs at least one visible dish, so customers never land on an empty menu. */
export async function setPublished(ctx: SettingsCtx, published: boolean) {
  if (published) {
    const [row] = await ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(menuItems)
      // A dish is only visible inside an active category of the same restaurant.
      .innerJoin(menuCategories, and(eq(menuCategories.id, menuItems.categoryId), eq(menuCategories.restaurantId, menuItems.restaurantId)))
      .where(and(eq(menuItems.restaurantId, ctx.repo.restaurantId), eq(menuItems.available, true), eq(menuCategories.active, true)));
    if ((row?.n ?? 0) === 0) throw new SettingsValidationError("publish_empty");
  }
  await update(ctx, { published }, published ? "restaurant.published" : "restaurant.unpublished");
}

export async function markOnboarded(ctx: SettingsCtx) {
  await mergeSettings(ctx, { onboardedAt: new Date().toISOString() }, "settings.onboarded");
}
