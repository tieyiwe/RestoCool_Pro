import "server-only";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { orders, restaurants, reviews } from "@/db/schema";

type Restaurant = typeof restaurants.$inferSelect;
import { writeAudit } from "@/lib/audit";
import { can, type Actor } from "@/lib/auth/can";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { sha256 } from "@/lib/tokens";

/** Reviews are on unless the business switched them off (Paramètres → Fonctions). */
export const reviewsEnabled = (r: Pick<Restaurant, "settings">) => r.settings.features?.reviews ?? true;

export const ReviewInput = z.object({
  orderId: z.uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(600).optional(),
  authorName: z.string().trim().max(40).optional(),
  lang: z.enum(["fr", "en", "zh"]).default("fr"),
});

export class ReviewError extends Error {
  constructor(readonly code: "disabled" | "not_served" | "already") {
    super(code);
  }
}

/** Only orders this phone placed and that were served (or paid) can be reviewed, once each. */
export async function submitReview(db: DB, r: Pick<Restaurant, "id" | "settings">, deviceId: string, input: z.infer<typeof ReviewInput>) {
  if (!reviewsEnabled(r)) throw new ReviewError("disabled");
  const [o] = await db
    .select({ id: orders.id, status: orders.status, device: orders.customerDeviceId })
    .from(orders)
    .where(and(eq(orders.restaurantId, r.id), eq(orders.id, input.orderId)));
  if (!o || o.device !== deviceId || (o.status !== "served" && o.status !== "paid")) throw new ReviewError("not_served");
  const [row] = await db
    .insert(reviews)
    .values({
      restaurantId: r.id,
      orderId: o.id,
      deviceHash: sha256(deviceId),
      rating: input.rating,
      comment: input.comment || null,
      authorName: input.authorName || null,
      lang: input.lang,
    })
    .onConflictDoNothing({ target: reviews.orderId })
    .returning({ id: reviews.id });
  if (!row) throw new ReviewError("already");
  return row.id;
}

export type ReviewSummary = { count: number; average: number | null; byStars: Record<1 | 2 | 3 | 4 | 5, number> };

async function summary(db: DB, restaurantId: string, statuses: Array<"visible" | "hidden" | "deleted">): Promise<ReviewSummary> {
  const rows = await db
    .select({ rating: reviews.rating, n: count() })
    .from(reviews)
    .where(and(eq(reviews.restaurantId, restaurantId), inArray(reviews.status, statuses)))
    .groupBy(reviews.rating);
  const byStars = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as ReviewSummary["byStars"];
  let total = 0;
  let sum = 0;
  for (const x of rows) {
    byStars[x.rating as 1] = x.n;
    total += x.n;
    sum += x.rating * x.n;
  }
  return { count: total, average: total ? Math.round((sum / total) * 10) / 10 : null, byStars };
}

/** Public page: visible reviews only (newest first), their average, and which of this phone's orders are already reviewed. */
export async function publicReviews(db: DB, restaurantId: string, opts: { deviceId?: string; limit?: number; offset?: number } = {}) {
  const list = await db
    .select({ id: reviews.id, rating: reviews.rating, comment: reviews.comment, authorName: reviews.authorName, lang: reviews.lang, createdAt: reviews.createdAt })
    .from(reviews)
    .where(and(eq(reviews.restaurantId, restaurantId), eq(reviews.status, "visible")))
    .orderBy(desc(reviews.createdAt))
    .limit(Math.min(opts.limit ?? 10, 30))
    .offset(opts.offset ?? 0);
  const reviewed = opts.deviceId
    ? (
        await db
          .select({ orderId: reviews.orderId })
          .from(reviews)
          .where(and(eq(reviews.restaurantId, restaurantId), eq(reviews.deviceHash, sha256(opts.deviceId))))
      ).flatMap((x) => (x.orderId ? [x.orderId] : []))
    : [];
  return { summary: await summary(db, restaurantId, ["visible"]), reviews: list.map((x) => ({ ...x, createdAt: x.createdAt.toISOString() })), reviewed };
}

type StaffCtx = { db: DB; actor: Actor; restaurantId: string };

/** The business's own view: every review it has not deleted, with the counts of each state. */
export async function businessReviews(ctx: StaffCtx, filter: "all" | "visible" | "hidden" | "deleted" = "all") {
  if (!can(ctx.actor, "reports.read", { restaurantId: ctx.restaurantId })) throw new ForbiddenError();
  const statuses = filter === "all" ? (["visible", "hidden"] as const) : ([filter] as const);
  const [list, all, visible, states] = await Promise.all([
    ctx.db
      .select({ id: reviews.id, rating: reviews.rating, comment: reviews.comment, authorName: reviews.authorName, lang: reviews.lang, status: reviews.status, createdAt: reviews.createdAt, orderCode: orders.code })
      .from(reviews)
      .leftJoin(orders, eq(orders.id, reviews.orderId))
      .where(and(eq(reviews.restaurantId, ctx.restaurantId), inArray(reviews.status, [...statuses])))
      .orderBy(desc(reviews.createdAt))
      .limit(200),
    summary(ctx.db, ctx.restaurantId, ["visible", "hidden"]),
    summary(ctx.db, ctx.restaurantId, ["visible"]),
    ctx.db
      .select({ status: reviews.status, n: count() })
      .from(reviews)
      .where(eq(reviews.restaurantId, ctx.restaurantId))
      .groupBy(reviews.status),
  ]);
  const n = (s: string) => states.find((x) => x.status === s)?.n ?? 0;
  return { list, all, visible, counts: { visible: n("visible"), hidden: n("hidden"), deleted: n("deleted") } };
}

/**
 * Hide, show again or delete a review (owner / managers: settings.write). « Delete » removes it
 * from the business's view and the public page; the platform keeps it (status deleted).
 */
export async function setReviewStatus(ctx: StaffCtx, reviewId: string, status: "visible" | "hidden" | "deleted", now = new Date()) {
  if (!can(ctx.actor, "settings.write", { restaurantId: ctx.restaurantId })) throw new ForbiddenError();
  const [before] = await ctx.db.select({ status: reviews.status, rating: reviews.rating }).from(reviews).where(and(eq(reviews.restaurantId, ctx.restaurantId), eq(reviews.id, reviewId)));
  // A deleted review stays deleted for the business (only the platform still sees it).
  if (!before || before.status === "deleted") throw new NotFoundError("review");
  const by = ctx.actor.kind === "member" ? ("memberId" in ctx.actor && ctx.actor.memberId ? ctx.actor.memberId : ctx.actor.userId) : ctx.actor.kind;
  await ctx.db.update(reviews).set({ status, statusBy: by, statusAt: now, updatedAt: now }).where(and(eq(reviews.restaurantId, ctx.restaurantId), eq(reviews.id, reviewId)));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: ctx.restaurantId, action: `review.${status === "visible" ? "shown" : status}`, entity: "review", entityId: reviewId, data: { from: before.status, rating: before.rating } });
}

/** Platform console: every review of every business (deleted and hidden included). */
export async function platformReviews(db: DB, f: { restaurantId?: string; status?: "visible" | "hidden" | "deleted"; maxStars?: number; limit?: number } = {}) {
  const where = and(
    f.restaurantId ? eq(reviews.restaurantId, f.restaurantId) : undefined,
    f.status ? eq(reviews.status, f.status) : undefined,
    f.maxStars ? sql`${reviews.rating} <= ${f.maxStars}` : undefined,
  );
  const [list, totals] = await Promise.all([
    db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        comment: reviews.comment,
        authorName: reviews.authorName,
        lang: reviews.lang,
        status: reviews.status,
        statusAt: reviews.statusAt,
        createdAt: reviews.createdAt,
        restaurantId: reviews.restaurantId,
        business: restaurants.name,
        slug: restaurants.slug,
        orderCode: orders.code,
      })
      .from(reviews)
      .innerJoin(restaurants, eq(restaurants.id, reviews.restaurantId))
      .leftJoin(orders, eq(orders.id, reviews.orderId))
      .where(where)
      .orderBy(desc(reviews.createdAt))
      .limit(Math.min(f.limit ?? 100, 500)),
    db
      .select({
        total: count(),
        average: sql<number | null>`round(avg(${reviews.rating})::numeric, 1)::float`,
        visible: sql<number>`count(*) filter (where ${reviews.status} = 'visible')::int`,
        hidden: sql<number>`count(*) filter (where ${reviews.status} = 'hidden')::int`,
        deleted: sql<number>`count(*) filter (where ${reviews.status} = 'deleted')::int`,
        low: sql<number>`count(*) filter (where ${reviews.rating} <= 2)::int`,
        lowRemoved: sql<number>`count(*) filter (where ${reviews.rating} <= 2 and ${reviews.status} <> 'visible')::int`,
      })
      .from(reviews)
      .where(where),
  ]);
  return { list, totals: totals[0]! };
}
