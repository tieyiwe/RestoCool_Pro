import "server-only";
import { and, eq, gte, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { adminNotes, appErrors, planEvents, restaurants } from "@/db/schema";
import type { Actor } from "@/lib/auth/can";
import { writeAudit } from "@/lib/audit";
import { NotFoundError } from "@/lib/errors";

type Superadmin = Extract<Actor, { kind: "superadmin" }>;
export type AdminCtx = { db: DB; actor: Superadmin };

const DAY = 86_400_000;
const PlanId = z.enum(["gratuit", "pro", "business"]);
const Status = z.enum(["trial", "active", "past_due", "suspended"]);

async function load(ctx: AdminCtx, id: string) {
  const r = await ctx.db.query.restaurants.findFirst({ where: eq(restaurants.id, id) });
  if (!r) throw new NotFoundError("restaurant");
  return r;
}

/** Change a business's plan, status and end date by hand (recorded as a plan event). */
export const PlanChange = z.object({
  plan: PlanId,
  status: Status,
  /** « YYYY-MM-DD » or empty = no end date. */
  expiresOn: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).default(""),
  reason: z.string().trim().max(300).optional(),
});
export async function changePlan(ctx: AdminCtx, id: string, input: z.input<typeof PlanChange>) {
  const p = PlanChange.parse(input);
  const r = await load(ctx, id);
  const expires = p.expiresOn ? new Date(`${p.expiresOn}T23:59:59Z`) : null;
  await ctx.db.transaction(async (tx) => {
    await tx.update(restaurants).set({ plan: p.plan, planStatus: p.status, planExpiresAt: expires, updatedAt: new Date() }).where(eq(restaurants.id, id));
    await tx.insert(planEvents).values({ restaurantId: id, fromPlan: r.plan, toPlan: p.plan, fromStatus: r.planStatus, toStatus: p.status, bySuperadmin: ctx.actor.email, reference: p.reason ?? null });
    await writeAudit(tx, ctx.actor, { restaurantId: id, action: "admin.plan_changed", entity: "restaurant", entityId: id, data: { from: `${r.plan}/${r.planStatus}`, to: `${p.plan}/${p.status}`, expiresOn: p.expiresOn || null } });
  });
}

/**
 * A plan payment received by hand (Orange Money, Moov Money, cash…): the plan becomes active and
 * its end date moves forward by the months paid, from today or from the current end if later.
 */
export const Payment = z.object({
  plan: z.enum(["pro", "business"]),
  months: z.coerce.number().int().min(1).max(24),
  amount: z.coerce.number().int().min(0).max(10_000_000),
  method: z.enum(["orange_money", "moov_money", "cash", "bank", "other"]),
  reference: z.string().trim().max(120).optional(),
});
export async function recordPlanPayment(ctx: AdminCtx, id: string, input: z.input<typeof Payment>, now = new Date()) {
  const p = Payment.parse(input);
  const r = await load(ctx, id);
  const from = r.planStatus === "active" && r.planExpiresAt && r.planExpiresAt > now ? r.planExpiresAt : now;
  const expires = new Date(from.getTime() + p.months * 30 * DAY);
  await ctx.db.transaction(async (tx) => {
    await tx.update(restaurants).set({ plan: p.plan, planStatus: "active", planExpiresAt: expires, updatedAt: now }).where(eq(restaurants.id, id));
    await tx.insert(planEvents).values({ restaurantId: id, fromPlan: r.plan, toPlan: p.plan, fromStatus: r.planStatus, toStatus: "active", amount: p.amount, method: p.method, reference: p.reference ?? null, bySuperadmin: ctx.actor.email });
    await writeAudit(tx, ctx.actor, { restaurantId: id, action: "admin.payment_recorded", entity: "restaurant", entityId: id, data: { amount: p.amount, method: p.method, months: p.months, until: expires.toISOString().slice(0, 10) } });
  });
  return expires;
}

/** Suspend (menu stays visible, ordering stops; data is never deleted) or reactivate. */
export async function setSuspended(ctx: AdminCtx, id: string, suspended: boolean, reason?: string) {
  const r = await load(ctx, id);
  // Back to what the plan says: the free plan is simply active; a paid plan past its end is late.
  const to = suspended
    ? "suspended"
    : r.plan === "gratuit"
      ? "active"
      : r.planExpiresAt && r.planExpiresAt < new Date()
        ? "past_due"
        : r.planExpiresAt
          ? "active"
          : "trial";
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(restaurants)
      .set({ planStatus: to, settings: { ...r.settings, suspendedReason: suspended ? (reason?.slice(0, 300) ?? "") : undefined }, updatedAt: new Date() })
      .where(eq(restaurants.id, id));
    await tx.insert(planEvents).values({ restaurantId: id, fromPlan: r.plan, toPlan: r.plan, fromStatus: r.planStatus, toStatus: to, bySuperadmin: ctx.actor.email, reference: reason ?? null });
    await writeAudit(tx, ctx.actor, { restaurantId: id, action: suspended ? "admin.suspended" : "admin.reactivated", entity: "restaurant", entityId: id, data: { reason: reason ?? null } });
  });
}

export async function setPublished(ctx: AdminCtx, id: string, published: boolean) {
  await load(ctx, id);
  await ctx.db.update(restaurants).set({ published, updatedAt: new Date() }).where(eq(restaurants.id, id));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: id, action: published ? "admin.published" : "admin.unpublished", entity: "restaurant", entityId: id });
}

/** « À la une » (1–3 on the home page and directory): taking a rank moves the others down. */
export async function setFeatured(ctx: AdminCtx, id: string, rank: number | null) {
  if (rank !== null && ![1, 2, 3].includes(rank)) throw new z.ZodError([]);
  await load(ctx, id);
  await ctx.db.transaction(async (tx) => {
    await tx.update(restaurants).set({ featuredRank: null }).where(eq(restaurants.id, id));
    if (rank !== null) {
      await tx.update(restaurants).set({ featuredRank: sql`${restaurants.featuredRank} + 1` }).where(and(isNotNull(restaurants.featuredRank), gte(restaurants.featuredRank, rank), ne(restaurants.id, id)));
      await tx.update(restaurants).set({ featuredRank: null }).where(sql`${restaurants.featuredRank} > 3`);
      await tx.update(restaurants).set({ featuredRank: rank }).where(eq(restaurants.id, id));
    }
    await writeAudit(tx, ctx.actor, { restaurantId: id, action: "admin.featured", entity: "restaurant", entityId: id, data: { rank } });
  });
}

export async function addNote(ctx: AdminCtx, id: string, body: string) {
  const text = z.string().trim().min(1).max(2000).parse(body);
  await load(ctx, id);
  await ctx.db.insert(adminNotes).values({ restaurantId: id, body: text, by: ctx.actor.email });
}

export async function resolveErrors(ctx: AdminCtx, id: string | "all") {
  await ctx.db
    .update(appErrors)
    .set({ resolvedAt: new Date() })
    .where(id === "all" ? isNull(appErrors.resolvedAt) : eq(appErrors.id, id));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: null, action: "admin.errors_resolved", entity: "app_error", entityId: id });
}
