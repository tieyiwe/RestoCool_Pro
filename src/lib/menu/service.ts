import "server-only";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { menuCategories, menuItemOptions, menuItemVariants, menuItems } from "@/db/schema";
import type { I18nText } from "@/db/schema";
import type { Actor } from "@/lib/auth/can";
import { writeAudit } from "@/lib/audit";
import { NotFoundError } from "@/lib/errors";
import { assertWithinLimit } from "@/lib/plan";
import type { TenantRepo } from "@/db/repos/tenant";
import { CategoryInput, ITEM_TAGS, ItemInput } from "./schemas";

/**
 * Menu writes. Every statement is pinned to ctx.restaurantId, and every id coming from
 * the browser (category, item) is re-checked against that restaurant before use.
 */
export type MenuCtx = { db: DB; actor: Actor; repo: TenantRepo };

const clean = (t: { fr: string; en?: string; zh?: string }): I18nText => {
  const out: I18nText = { fr: t.fr.trim() };
  if (t.en?.trim()) out.en = t.en.trim();
  if (t.zh?.trim()) out.zh = t.zh.trim();
  return out;
};
const cleanOptional = (t: { fr?: string; en?: string; zh?: string }): I18nText | null =>
  t.fr?.trim() ? clean({ fr: t.fr, en: t.en, zh: t.zh }) : null;

/** « Épuisé aujourd'hui » lasts until the next local midnight (Africa/Ouagadougou is UTC+0). */
export function endOfLocalDay(now = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d;
}

async function requireCategory({ db, repo }: MenuCtx, categoryId: string) {
  const c = await db.query.menuCategories.findFirst({
    where: and(eq(menuCategories.restaurantId, repo.restaurantId), eq(menuCategories.id, categoryId)),
  });
  if (!c) throw new NotFoundError("category");
  return c;
}

async function requireItem({ repo }: MenuCtx, itemId: string) {
  const i = await repo.menu.item(itemId);
  if (!i) throw new NotFoundError("item");
  return i;
}

/* ---------------- Categories ---------------- */

export async function createCategory(ctx: MenuCtx, input: CategoryInput) {
  const data = CategoryInput.parse(input);
  const rid = ctx.repo.restaurantId;
  const [max] = await ctx.db
    .select({ n: sql<number>`coalesce(max(${menuCategories.sort}), 0)::int` })
    .from(menuCategories)
    .where(eq(menuCategories.restaurantId, rid));
  const [row] = await ctx.db
    .insert(menuCategories)
    .values({ restaurantId: rid, name: clean(data.name), active: data.active, timeWindow: data.timeWindow, sort: (max?.n ?? 0) + 1 })
    .returning();
  await writeAudit(ctx.db, ctx.actor, { restaurantId: rid, action: "menu.category.created", entity: "menu_category", entityId: row!.id });
  return row!;
}

export async function updateCategory(ctx: MenuCtx, categoryId: string, input: CategoryInput) {
  await requireCategory(ctx, categoryId);
  const data = CategoryInput.parse(input);
  await ctx.db
    .update(menuCategories)
    .set({ name: clean(data.name), active: data.active, timeWindow: data.timeWindow })
    .where(and(eq(menuCategories.restaurantId, ctx.repo.restaurantId), eq(menuCategories.id, categoryId)));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: ctx.repo.restaurantId, action: "menu.category.updated", entity: "menu_category", entityId: categoryId });
}

/** Swap with the previous/next category. */
export async function moveCategory(ctx: MenuCtx, categoryId: string, dir: "up" | "down") {
  const all = await ctx.repo.menu.categories();
  const i = all.findIndex((c) => c.id === categoryId);
  if (i < 0) throw new NotFoundError("category");
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= all.length) return;
  const order = all.map((c) => c.id);
  [order[i], order[j]] = [order[j]!, order[i]!];
  await reorderCategories(ctx, order);
}

/** Persist a full order (used by up/down and drag-and-drop). Unknown ids are ignored. */
export async function reorderCategories(ctx: MenuCtx, orderedIds: string[]) {
  const rid = ctx.repo.restaurantId;
  const own = new Set((await ctx.repo.menu.categories()).map((c) => c.id));
  await ctx.db.transaction(async (tx) => {
    let sort = 1;
    for (const id of orderedIds) {
      if (!own.has(id)) continue;
      await tx.update(menuCategories).set({ sort: sort++ }).where(and(eq(menuCategories.restaurantId, rid), eq(menuCategories.id, id)));
    }
  });
}

/** Only empty categories can be deleted (no accidental loss of dishes). */
export async function deleteCategory(ctx: MenuCtx, categoryId: string): Promise<"deleted" | "not_empty"> {
  await requireCategory(ctx, categoryId);
  const rid = ctx.repo.restaurantId;
  const [count] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(menuItems)
    .where(and(eq(menuItems.restaurantId, rid), eq(menuItems.categoryId, categoryId)));
  if ((count?.n ?? 0) > 0) return "not_empty";
  await ctx.db.delete(menuCategories).where(and(eq(menuCategories.restaurantId, rid), eq(menuCategories.id, categoryId)));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: rid, action: "menu.category.deleted", entity: "menu_category", entityId: categoryId });
  return "deleted";
}

/* ---------------- Items ---------------- */

async function writeChildren(tx: Pick<DB, "insert" | "delete">, rid: string, itemId: string, data: ItemInput) {
  await tx.delete(menuItemVariants).where(and(eq(menuItemVariants.restaurantId, rid), eq(menuItemVariants.itemId, itemId)));
  await tx.delete(menuItemOptions).where(and(eq(menuItemOptions.restaurantId, rid), eq(menuItemOptions.itemId, itemId)));
  if (data.variants.length) {
    await tx
      .insert(menuItemVariants)
      .values(data.variants.map((v, i) => ({ restaurantId: rid, itemId, name: clean(v.name), price: v.price, sort: i + 1 })));
  }
  if (data.options.length) {
    await tx.insert(menuItemOptions).values(
      data.options.map((o, i) => ({ restaurantId: rid, itemId, group: clean(o.group), name: clean(o.name), priceDelta: o.priceDelta, maxSelect: 1, sort: i + 1 })),
    );
  }
}

function itemColumns(data: ItemInput) {
  return {
    categoryId: data.categoryId,
    code: data.code?.trim() || null,
    name: clean(data.name),
    description: cleanOptional(data.description),
    // With variants, the dish price is the variants' prices.
    price: data.variants.length ? null : data.price,
    spicy: data.spicy,
    tags: data.tags,
    station: data.station,
    photoUrl: data.photoUrl,
    thumbUrl: data.thumbUrl ?? data.photoUrl,
    available: data.available,
  };
}

/** Photo URLs from our media route must belong to this restaurant. */
function assertOwnPhoto(rid: string, data: ItemInput) {
  for (const url of [data.photoUrl, data.thumbUrl]) {
    if (url?.startsWith("/api/media/") && !url.startsWith(`/api/media/r/${rid}/`)) throw new NotFoundError("media");
  }
}

export async function createItem(ctx: MenuCtx, input: ItemInput) {
  const data = ItemInput.parse(input);
  const rid = ctx.repo.restaurantId;
  await requireCategory(ctx, data.categoryId);
  assertOwnPhoto(rid, data);
  const restaurant = await ctx.repo.restaurant.get();
  if (!restaurant) throw new NotFoundError("restaurant");
  assertWithinLimit(restaurant, "menuItems", await ctx.repo.menu.countItems());

  const row = await ctx.db.transaction(async (tx) => {
    const [max] = await tx
      .select({ n: sql<number>`coalesce(max(${menuItems.sort}), 0)::int` })
      .from(menuItems)
      .where(and(eq(menuItems.restaurantId, rid), eq(menuItems.categoryId, data.categoryId)));
    const [item] = await tx
      .insert(menuItems)
      .values({ restaurantId: rid, ...itemColumns(data), sort: (max?.n ?? 0) + 1 })
      .returning();
    await writeChildren(tx, rid, item!.id, data);
    await writeAudit(tx, ctx.actor, { restaurantId: rid, action: "menu.item.created", entity: "menu_item", entityId: item!.id });
    return item!;
  });
  return row;
}

export async function updateItem(ctx: MenuCtx, itemId: string, input: ItemInput) {
  const data = ItemInput.parse(input);
  const rid = ctx.repo.restaurantId;
  await requireItem(ctx, itemId);
  await requireCategory(ctx, data.categoryId);
  assertOwnPhoto(rid, data);
  await ctx.db.transaction(async (tx) => {
    await tx.update(menuItems).set(itemColumns(data)).where(and(eq(menuItems.restaurantId, rid), eq(menuItems.id, itemId)));
    await writeChildren(tx, rid, itemId, data);
    await writeAudit(tx, ctx.actor, { restaurantId: rid, action: "menu.item.updated", entity: "menu_item", entityId: itemId });
  });
}

export async function deleteItem(ctx: MenuCtx, itemId: string) {
  await requireItem(ctx, itemId);
  const rid = ctx.repo.restaurantId;
  await ctx.db.delete(menuItems).where(and(eq(menuItems.restaurantId, rid), eq(menuItems.id, itemId)));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: rid, action: "menu.item.deleted", entity: "menu_item", entityId: itemId });
}

export async function duplicateItem(ctx: MenuCtx, itemId: string) {
  const item = await requireItem(ctx, itemId);
  const rid = ctx.repo.restaurantId;
  const [variants, options] = await Promise.all([
    ctx.db.select().from(menuItemVariants).where(and(eq(menuItemVariants.restaurantId, rid), eq(menuItemVariants.itemId, itemId))).orderBy(asc(menuItemVariants.sort)),
    ctx.db.select().from(menuItemOptions).where(and(eq(menuItemOptions.restaurantId, rid), eq(menuItemOptions.itemId, itemId))).orderBy(asc(menuItemOptions.sort)),
  ]);
  return createItem(ctx, {
    categoryId: item.categoryId,
    code: "",
    name: { fr: `${item.name.fr} (copie)`, en: item.name.en ?? "", zh: item.name.zh ?? "" },
    description: { fr: item.description?.fr ?? "", en: item.description?.en ?? "", zh: item.description?.zh ?? "" },
    price: item.price,
    variants: variants.map((v) => ({ name: { fr: v.name.fr, en: v.name.en ?? "", zh: v.name.zh ?? "" }, price: v.price })),
    options: options.map((o) => ({
      group: { fr: o.group.fr, en: o.group.en ?? "", zh: o.group.zh ?? "" },
      name: { fr: o.name.fr, en: o.name.en ?? "", zh: o.name.zh ?? "" },
      priceDelta: o.priceDelta,
    })),
    spicy: item.spicy,
    tags: item.tags.filter((t): t is ItemInput["tags"][number] => (ITEM_TAGS as readonly string[]).includes(t)),
    station: item.station,
    photoUrl: item.photoUrl,
    thumbUrl: item.thumbUrl,
    available: false, // hidden until the owner reviews the copy
  });
}

/** Swap with the previous/next dish in the same category. */
export async function moveItem(ctx: MenuCtx, itemId: string, dir: "up" | "down") {
  const item = await requireItem(ctx, itemId);
  const rid = ctx.repo.restaurantId;
  const siblings = await ctx.db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(and(eq(menuItems.restaurantId, rid), eq(menuItems.categoryId, item.categoryId)))
    .orderBy(asc(menuItems.sort), asc(menuItems.createdAt));
  const ids = siblings.map((s) => s.id);
  const i = ids.indexOf(itemId);
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  await ctx.db.transaction(async (tx) => {
    for (const [k, id] of ids.entries()) {
      await tx.update(menuItems).set({ sort: k + 1 }).where(and(eq(menuItems.restaurantId, rid), eq(menuItems.id, id)));
    }
  });
}

/** Toggle « Épuisé aujourd'hui » (resets automatically at midnight). Allowed for kitchen and servers too. */
export async function setSoldOutToday(ctx: MenuCtx, itemId: string, soldOut: boolean) {
  await requireItem(ctx, itemId);
  const rid = ctx.repo.restaurantId;
  await ctx.db
    .update(menuItems)
    .set({ soldOutUntil: soldOut ? endOfLocalDay() : null })
    .where(and(eq(menuItems.restaurantId, rid), eq(menuItems.id, itemId)));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: rid, action: soldOut ? "menu.item.sold_out" : "menu.item.back_in_stock", entity: "menu_item", entityId: itemId });
}

export async function setItemAvailable(ctx: MenuCtx, itemId: string, available: boolean) {
  await requireItem(ctx, itemId);
  const rid = ctx.repo.restaurantId;
  await ctx.db.update(menuItems).set({ available }).where(and(eq(menuItems.restaurantId, rid), eq(menuItems.id, itemId)));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: rid, action: available ? "menu.item.shown" : "menu.item.hidden", entity: "menu_item", entityId: itemId });
}

/** Items currently sold out (for dashboards). */
export async function soldOutNow(ctx: MenuCtx, now = new Date()) {
  return ctx.db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(and(eq(menuItems.restaurantId, ctx.repo.restaurantId), gt(menuItems.soldOutUntil, now)));
}

