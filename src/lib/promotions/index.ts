import "server-only";
import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { menuItems, promotions, restaurants } from "@/db/schema";
import { PROMO_THEME_IDS } from "@/config/promo-themes";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/can";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { log } from "@/lib/log";

export const PLATFORM_PLACEMENTS = ["home_hero", "home_strip", "free_menu"] as const;
export const BUSINESS_PLACEMENTS = ["page", "item"] as const;
export type Promotion = typeof promotions.$inferSelect;
/** A business keeps at most this many promotions (running or planned). */
export const MAX_BUSINESS_PROMOS = 12;

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);
const DateIn = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? new Date(v) : null))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), "date");
const Link = z
  .string()
  .trim()
  .max(300)
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || v.startsWith("/") || v.startsWith("https://"), "link");

const Base = {
  title: z.object({ fr: z.string().trim().min(2).max(90), en: opt(90), zh: opt(90) }),
  body: z.object({ fr: opt(400), en: opt(400), zh: opt(400) }),
  badge: opt(24),
  theme: z.enum(PROMO_THEME_IDS as [string, ...string[]]).default("gold"),
  imageUrl: Link,
  startsAt: DateIn,
  endsAt: DateIn,
  active: z.boolean().default(true),
};

export const PlatformPromoInput = z.object({
  ...Base,
  placement: z.enum(PLATFORM_PLACEMENTS),
  ctaLabel: z.object({ fr: opt(30), en: opt(30) }),
  link: Link,
  restaurantId: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  priority: z.coerce.number().int().min(0).max(100).default(0),
  cities: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  kinds: z.array(z.enum(["restaurant", "transport"])).default([]),
});

export const BusinessPromoInput = z.object({
  ...Base,
  placement: z.enum(BUSINESS_PLACEMENTS),
  itemId: z.uuid().optional().or(z.literal("").transform(() => undefined)),
  promoPrice: z.coerce.number().int().min(0).max(10_000_000).optional().or(z.literal("").transform(() => undefined)),
});

const clean = <T extends { fr?: string; en?: string; zh?: string }>(x: T) => (x.fr ? (Object.fromEntries(Object.entries(x).filter(([, v]) => v)) as { fr: string } & Partial<Record<string, string>>) : null);

/** Running now: switched on and inside its dates. */
const LIVE = () => and(eq(promotions.active, true), or(isNull(promotions.startsAt), lte(promotions.startsAt, sql`now()`)), or(isNull(promotions.endsAt), gt(promotions.endsAt, sql`now()`)));

export function promoState(p: Pick<Promotion, "active" | "startsAt" | "endsAt">, now = new Date()): "live" | "scheduled" | "ended" | "paused" {
  if (p.endsAt && p.endsAt <= now) return "ended";
  if (!p.active) return "paused";
  if (p.startsAt && p.startsAt > now) return "scheduled";
  return "live";
}

// ---- Platform campaigns (console) ----

type AdminActor = Extract<Actor, { kind: "superadmin" }>;

export async function savePlatformPromo(db: DB, actor: AdminActor, raw: unknown, id?: string) {
  const i = PlatformPromoInput.parse(raw);
  if (i.endsAt && i.startsAt && i.endsAt <= i.startsAt) throw new z.ZodError([]);
  let link = i.link;
  if (i.restaurantId && !link) {
    const [r] = await db.select({ slug: restaurants.slug }).from(restaurants).where(eq(restaurants.id, i.restaurantId));
    if (!r) throw new NotFoundError();
    link = `/r/${r.slug}`;
  }
  const values = {
    scope: "platform",
    placement: i.placement,
    restaurantId: i.restaurantId ?? null,
    title: clean(i.title)!,
    body: clean(i.body),
    ctaLabel: clean(i.ctaLabel),
    link,
    imageUrl: i.imageUrl,
    badge: i.badge ?? null,
    theme: i.theme,
    target: i.placement === "free_menu" && (i.cities.length || i.kinds.length) ? { cities: i.cities, kinds: i.kinds } : null,
    priority: i.priority,
    active: i.active,
    startsAt: i.startsAt,
    endsAt: i.endsAt,
  };
  const [row] = id
    ? await db.update(promotions).set({ ...values, updatedAt: new Date() }).where(and(eq(promotions.id, id), eq(promotions.scope, "platform"))).returning()
    : await db.insert(promotions).values({ ...values, createdBy: actor.email }).returning();
  if (!row) throw new NotFoundError();
  await writeAudit(db, actor, { restaurantId: i.restaurantId ?? null, action: id ? "admin.promo_updated" : "admin.promo_created", entity: "promotion", entityId: row.id, data: { placement: i.placement, title: values.title.fr } });
  invalidate();
  return row;
}

export async function setPromoActive(db: DB, actor: Actor, id: string, active: boolean, restaurantId?: string) {
  const where = restaurantId ? and(eq(promotions.id, id), eq(promotions.restaurantId, restaurantId), eq(promotions.scope, "business")) : eq(promotions.id, id);
  const [row] = await db.update(promotions).set({ active, updatedAt: new Date() }).where(where).returning({ id: promotions.id, restaurantId: promotions.restaurantId });
  if (!row) throw new NotFoundError();
  await writeAudit(db, actor, { restaurantId: row.restaurantId, action: active ? "promo.resumed" : "promo.paused", entity: "promotion", entityId: id });
  invalidate();
}

export async function deletePromo(db: DB, actor: Actor, id: string, restaurantId?: string) {
  const where = restaurantId ? and(eq(promotions.id, id), eq(promotions.restaurantId, restaurantId), eq(promotions.scope, "business")) : eq(promotions.id, id);
  const [row] = await db.delete(promotions).where(where).returning({ id: promotions.id, restaurantId: promotions.restaurantId });
  if (!row) throw new NotFoundError();
  await writeAudit(db, actor, { restaurantId: row.restaurantId, action: "promo.deleted", entity: "promotion", entityId: id });
  invalidate();
}

export async function listPlatformPromos(db: DB) {
  return db.select().from(promotions).where(eq(promotions.scope, "platform")).orderBy(desc(promotions.createdAt));
}

/** Business offers across the platform (console moderation), newest first. */
export async function listBusinessPromosAll(db: DB, limit = 50) {
  return db
    .select({ p: promotions, business: restaurants.name, slug: restaurants.slug })
    .from(promotions)
    .innerJoin(restaurants, eq(restaurants.id, promotions.restaurantId))
    .where(eq(promotions.scope, "business"))
    .orderBy(desc(promotions.createdAt))
    .limit(limit);
}

// Live platform campaigns are read on every home page and free menu: cached 30 s.
let cache: { at: number; rows: Promotion[] } | null = null;
function invalidate() {
  cache = null;
}
async function livePlatform(db: DB): Promise<Promotion[]> {
  if (cache && Date.now() - cache.at < 30_000) return cache.rows;
  const rows = await db.select().from(promotions).where(and(eq(promotions.scope, "platform"), LIVE())).orderBy(desc(promotions.priority), desc(promotions.createdAt));
  cache = { at: Date.now(), rows };
  return rows;
}

const cityKey = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export async function platformPromos(db: DB, placement: (typeof PLATFORM_PLACEMENTS)[number], business?: { city: string | null; kind: string }) {
  const rows = (await livePlatform(db)).filter((p) => p.placement === placement);
  if (!business) return rows;
  return rows.filter((p) => {
    const t = p.target;
    if (t?.cities?.length && !t.cities.map(cityKey).includes(cityKey(business.city))) return false;
    if (t?.kinds?.length && !t.kinds.includes(business.kind)) return false;
    return true;
  });
}

// ---- A business's own promotions (Business plan) ----

type MemberActor = Extract<Actor, { kind: "member" }>;

export async function listBusinessPromos(db: DB, restaurantId: string) {
  return db.select().from(promotions).where(and(eq(promotions.scope, "business"), eq(promotions.restaurantId, restaurantId))).orderBy(desc(promotions.active), asc(promotions.endsAt), desc(promotions.createdAt));
}

export async function saveBusinessPromo(db: DB, actor: MemberActor, restaurantId: string, raw: unknown, id?: string) {
  const i = BusinessPromoInput.parse(raw);
  if (i.endsAt && i.startsAt && i.endsAt <= i.startsAt) throw new z.ZodError([]);
  if (i.placement === "item") {
    if (!i.itemId) throw new z.ZodError([]);
    const [item] = await db.select({ id: menuItems.id }).from(menuItems).where(and(eq(menuItems.id, i.itemId), eq(menuItems.restaurantId, restaurantId)));
    if (!item) throw new NotFoundError();
  }
  if (!id) {
    const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(promotions).where(and(eq(promotions.scope, "business"), eq(promotions.restaurantId, restaurantId), or(isNull(promotions.endsAt), gt(promotions.endsAt, sql`now()`))));
    if ((n?.n ?? 0) >= MAX_BUSINESS_PROMOS) throw new ForbiddenError();
  }
  const values = {
    scope: "business",
    restaurantId,
    placement: i.placement,
    itemId: i.placement === "item" ? i.itemId! : null,
    title: clean(i.title)!,
    body: clean(i.body),
    imageUrl: i.imageUrl,
    badge: i.badge ?? null,
    promoPrice: i.placement === "item" ? (i.promoPrice ?? null) : null,
    theme: i.theme,
    active: i.active,
    startsAt: i.startsAt,
    endsAt: i.endsAt,
  };
  const [row] = id
    ? await db.update(promotions).set({ ...values, updatedAt: new Date() }).where(and(eq(promotions.id, id), eq(promotions.restaurantId, restaurantId), eq(promotions.scope, "business"))).returning()
    : await db.insert(promotions).values({ ...values, createdBy: actor.userId }).returning();
  if (!row) throw new NotFoundError();
  await writeAudit(db, actor, { restaurantId, action: id ? "promo.updated" : "promo.created", entity: "promotion", entityId: row.id, data: { placement: i.placement, title: values.title.fr } });
  return row;
}

/** Running offers on a business page (only while its plan includes promotions). */
export async function liveBusinessPromos(db: DB, restaurantId: string) {
  return db
    .select()
    .from(promotions)
    .where(and(eq(promotions.scope, "business"), eq(promotions.restaurantId, restaurantId), LIVE()))
    .orderBy(desc(promotions.priority), asc(promotions.endsAt), desc(promotions.createdAt))
    .limit(MAX_BUSINESS_PROMOS);
}

/** itemId → promo price of running dish offers (orders use it: the price is decided on the server). */
export async function promoPrices(db: DB, restaurantId: string, itemIds: string[]): Promise<Map<string, number>> {
  if (!itemIds.length) return new Map();
  const rows = await db
    .select({ itemId: promotions.itemId, price: promotions.promoPrice })
    .from(promotions)
    .where(and(eq(promotions.scope, "business"), eq(promotions.restaurantId, restaurantId), eq(promotions.placement, "item"), inArray(promotions.itemId, itemIds), LIVE()));
  const out = new Map<string, number>();
  for (const r of rows) if (r.itemId && r.price !== null && (!out.has(r.itemId) || r.price < out.get(r.itemId)!)) out.set(r.itemId, r.price);
  return out;
}

// ---- Views and taps (anonymous counters) ----

/** One view (once per visit, decided on the phone) or tap: a single-row increment. */
export async function countPromo(db: DB, id: string, kind: "view" | "click") {
  try {
    if (kind === "view") await db.update(promotions).set({ views: sql`${promotions.views} + 1` }).where(eq(promotions.id, id));
    else await db.update(promotions).set({ clicks: sql`${promotions.clicks} + 1` }).where(eq(promotions.id, id));
  } catch (err) {
    log.warn("promo.count_failed", { error: err instanceof Error ? err.message : String(err) });
  }
}
