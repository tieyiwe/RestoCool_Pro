import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { accessCodes, adminNotes, auditLog, members, menuCategories, menuItems, orders, planEvents, restaurants } from "@/db/schema";
import { type PlanId, type PlanStatus } from "@/config/plans";
import { effectiveStatus } from "@/lib/plan";
import { normalizeCode } from "@/lib/access-code-format";

/** Filters of the super admin's business list (from the page's query string). */
export const BusinessFilter = z.object({
  q: z.string().trim().max(80).default(""),
  plan: z.enum(["all", "gratuit", "pro", "business"]).default("all"),
  status: z.enum(["all", "trial", "active", "past_due", "suspended"]).default("all"),
  kind: z.enum(["all", "restaurant", "transport"]).default("all"),
  published: z.enum(["all", "yes", "no"]).default("all"),
  sort: z.enum(["recent", "name", "orders", "expiry"]).default("recent"),
});
export type BusinessFilter = z.infer<typeof BusinessFilter>;

export type BusinessRow = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  kind: string;
  plan: PlanId;
  planStatus: PlanStatus;
  status: PlanStatus;
  planExpiresAt: Date | null;
  published: boolean;
  featuredRank: number | null;
  createdAt: Date;
  rc: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  items: number;
  orders30: number;
  gmv30: number;
  lastOrderAt: Date | null;
  setupDone: boolean;
};

/** Every business with its owner, numéro RC and activity, filtered and sorted. Super admin only. */
export async function listBusinesses(db: DB, f: BusinessFilter, now = new Date()): Promise<BusinessRow[]> {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const like = `%${f.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const code = f.q ? normalizeCode(f.q) : null;
  const rows = (
    await db.execute<Record<string, unknown>>(sql`
      select r.id, r.name, r.slug, r.city, r.kind, r.plan, r.plan_status, r.plan_expires_at, r.published, r.featured_rank, r.created_at,
        (r.settings->>'onboardedAt') is not null as setup_done,
        (select a.code from access_codes a where a.restaurant_id = r.id and a.seat_id is null limit 1) as rc,
        (select m.name from members m where m.restaurant_id = r.id and m.role = 'owner' order by m.created_at limit 1) as owner_name,
        coalesce((select m.email from members m where m.restaurant_id = r.id and m.role = 'owner' order by m.created_at limit 1), r.settings->>'ownerEmail') as owner_email,
        (select count(*)::int from menu_items i where i.restaurant_id = r.id) as items,
        (select count(*)::int from orders o where o.restaurant_id = r.id and o.sent_at >= ${since}) as orders30,
        (select coalesce(sum(o.subtotal), 0)::bigint from orders o where o.restaurant_id = r.id and o.sent_at >= ${since} and o.status <> 'cancelled') as gmv30,
        (select max(o.sent_at) from orders o where o.restaurant_id = r.id) as last_order_at
      from restaurants r
      where (${f.q} = '' or r.name ilike ${like} or r.slug ilike ${like} or coalesce(r.city, '') ilike ${like}
        or exists (select 1 from members m where m.restaurant_id = r.id and m.email ilike ${like})
        or coalesce(r.settings->>'ownerEmail', '') ilike ${like}
        or exists (select 1 from access_codes a where a.restaurant_id = r.id and a.seat_id is null and a.code = ${code ?? "-"}))
        and (${f.plan} = 'all' or r.plan::text = ${f.plan})
        and (${f.kind} = 'all' or r.kind = ${f.kind})
        and (${f.published} = 'all' or r.published = ${f.published === "yes"})
      limit 1000`)
  ).rows;
  const list: BusinessRow[] = rows.map((r) => {
    const planExpiresAt = r.plan_expires_at ? new Date(r.plan_expires_at as string) : null;
    const plan = r.plan as PlanId;
    const planStatus = r.plan_status as PlanStatus;
    return {
      id: r.id as string,
      name: r.name as string,
      slug: r.slug as string,
      city: (r.city as string | null) ?? null,
      kind: r.kind as string,
      plan,
      planStatus,
      status: effectiveStatus({ plan, planStatus, planExpiresAt }, now),
      planExpiresAt,
      published: Boolean(r.published),
      featuredRank: (r.featured_rank as number | null) ?? null,
      createdAt: new Date(r.created_at as string),
      rc: (r.rc as string | null) ?? null,
      ownerName: (r.owner_name as string | null) ?? null,
      ownerEmail: (r.owner_email as string | null) ?? null,
      items: Number(r.items ?? 0),
      orders30: Number(r.orders30 ?? 0),
      gmv30: Number(r.gmv30 ?? 0),
      lastOrderAt: r.last_order_at ? new Date(r.last_order_at as string) : null,
      setupDone: Boolean(r.setup_done),
    };
  });
  const filtered = f.status === "all" ? list : list.filter((b) => b.status === f.status);
  const by: Record<BusinessFilter["sort"], (a: BusinessRow, b: BusinessRow) => number> = {
    recent: (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    name: (a, b) => a.name.localeCompare(b.name, "fr"),
    orders: (a, b) => b.orders30 - a.orders30,
    expiry: (a, b) => (a.planExpiresAt?.getTime() ?? Infinity) - (b.planExpiresAt?.getTime() ?? Infinity),
  };
  return filtered.sort(by[f.sort]);
}

/** One business, everything the super admin needs (read-only view included). */
export async function businessDetail(db: DB, id: string) {
  const r = await db.query.restaurants.findFirst({ where: eq(restaurants.id, id) });
  if (!r) return null;
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [team, rc, cats, items, recent, events, notes, audit, stats] = await Promise.all([
    db
      .select({ id: members.id, name: members.name, email: members.email, phone: members.phone, role: members.role, staffNo: members.staffNo, active: members.active, lastSeenAt: members.lastSeenAt, hasAccount: sql<boolean>`${members.clerkUserId} is not null` })
      .from(members)
      .where(eq(members.restaurantId, id))
      .orderBy(members.staffNo),
    db.select({ code: accessCodes.code }).from(accessCodes).where(and(eq(accessCodes.restaurantId, id), isNull(accessCodes.seatId))).limit(1),
    db.select({ id: menuCategories.id, name: menuCategories.name }).from(menuCategories).where(eq(menuCategories.restaurantId, id)).orderBy(menuCategories.sort),
    db.select({ categoryId: menuItems.categoryId, photo: menuItems.photoUrl }).from(menuItems).where(eq(menuItems.restaurantId, id)),
    db
      .select({ id: orders.id, code: orders.code, number: orders.number, status: orders.status, subtotal: orders.subtotal, seatLabel: orders.seatLabel, seatType: orders.seatType, sentAt: orders.sentAt })
      .from(orders)
      .where(eq(orders.restaurantId, id))
      .orderBy(desc(orders.sentAt))
      .limit(15),
    db.select().from(planEvents).where(eq(planEvents.restaurantId, id)).orderBy(desc(planEvents.createdAt)).limit(30),
    db.select().from(adminNotes).where(eq(adminNotes.restaurantId, id)).orderBy(desc(adminNotes.createdAt)).limit(50),
    db.select().from(auditLog).where(eq(auditLog.restaurantId, id)).orderBy(desc(auditLog.createdAt)).limit(40),
    db.execute<{ orders30: number; gmv30: number; all: number; gmv: number }>(sql`
      select count(*) filter (where sent_at >= ${since})::int as orders30,
        coalesce(sum(subtotal) filter (where sent_at >= ${since} and status <> 'cancelled'), 0)::bigint as gmv30,
        count(*)::int as all, coalesce(sum(subtotal) filter (where status <> 'cancelled'), 0)::bigint as gmv
      from orders where restaurant_id = ${id}`),
  ]);
  const s = stats.rows[0];
  return {
    r,
    status: effectiveStatus(r),
    rc: rc[0]?.code ?? null,
    team,
    menu: cats.map((c) => ({ ...c, items: items.filter((i) => i.categoryId === c.id).length, photos: items.filter((i) => i.categoryId === c.id && i.photo).length })),
    itemCount: items.length,
    recent,
    events,
    notes,
    audit,
    stats: { orders30: Number(s?.orders30 ?? 0), gmv30: Number(s?.gmv30 ?? 0), orders: Number(s?.all ?? 0), gmv: Number(s?.gmv ?? 0) },
  };
}
