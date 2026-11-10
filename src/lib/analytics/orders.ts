import "server-only";
import { sql } from "drizzle-orm";
import type { DB } from "@/db";
import { formatStaffNo } from "@/lib/personnel";

export const RANGES = { today: 1, "7d": 7, "30d": 30 } as const;
export type Range = keyof typeof RANGES;

/** Start of the period in Africa/Ouagadougou (= UTC): today 00:00, or N-1 days before. */
export function rangeStart(range: Range, now = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (RANGES[range] - 1));
  return d;
}

const n = (v: unknown) => Number(v ?? 0);

/**
 * Order and personnel figures for one restaurant and period. Revenue counts served (and paid)
 * orders only, priced items only (« sur demande » dishes have no price until payments, M5).
 */
export async function orderAnalytics(db: DB, restaurantId: string, range: Range, now = new Date()) {
  const from = rangeStart(range, now);
  const [summary, hours, top, people] = await Promise.all([
    db.execute(sql`
      select
        count(*) filter (where status <> 'cancelled')::int as orders,
        count(*) filter (where status = 'cancelled')::int as cancelled,
        count(*) filter (where status in ('sent','confirmed','preparing','ready'))::int as open,
        coalesce(sum(subtotal) filter (where status in ('served','paid')), 0)::int as revenue,
        count(*) filter (where status in ('served','paid'))::int as served,
        avg(extract(epoch from (served_at - sent_at)) / 60) filter (where status in ('served','paid') and served_at is not null) as avg_service_min,
        avg(extract(epoch from (ready_at - coalesce(confirmed_at, sent_at))) / 60) filter (where status <> 'cancelled' and ready_at is not null) as avg_prep_min
      from orders where restaurant_id = ${restaurantId} and sent_at >= ${from}`),
    db.execute(sql`
      select extract(hour from sent_at at time zone 'Africa/Ouagadougou')::int as h, count(*)::int as c
      from orders where restaurant_id = ${restaurantId} and sent_at >= ${from} and status <> 'cancelled'
      group by 1 order by 1`),
    db.execute(sql`
      select i.name_snapshot as name, i.code as code, sum(i.qty)::int as qty
      from order_items i join orders o on o.id = i.order_id
      where o.restaurant_id = ${restaurantId} and i.restaurant_id = ${restaurantId} and o.sent_at >= ${from}
        and o.status <> 'cancelled' and i.status <> 'cancelled'
      group by i.name_snapshot, i.code order by 3 desc limit 5`),
    db.execute(sql`
      select m.id, m.name, m.email, m.staff_no, m.role,
        count(distinct o.id) filter (where o.confirmed_by = m.id)::int as confirmed,
        count(distinct o.id) filter (where o.prepared_by = m.id)::int as prepared,
        count(distinct o.id) filter (where o.served_by = m.id)::int as served,
        count(distinct o.id) filter (where o.cancelled_by = m.id)::int as cancelled,
        avg(extract(epoch from (o.served_at - o.sent_at)) / 60) filter (where o.served_by = m.id and o.status in ('served','paid')) as avg_service_min
      from members m
      left join orders o on o.restaurant_id = m.restaurant_id and o.sent_at >= ${from}
        and (o.confirmed_by = m.id or o.prepared_by = m.id or o.served_by = m.id or o.cancelled_by = m.id)
      where m.restaurant_id = ${restaurantId}
      group by m.id order by m.staff_no nulls last`),
  ]);
  const s = summary.rows[0] ?? {};
  const served = n(s.served);
  const byHour = Array.from({ length: 24 }, (_, h) => n(hours.rows.find((r) => n(r.h) === h)?.c));
  return {
    from,
    orders: n(s.orders),
    cancelled: n(s.cancelled),
    open: n(s.open),
    revenue: n(s.revenue),
    served,
    avgTicket: served ? Math.round(n(s.revenue) / served) : 0,
    avgServiceMin: s.avg_service_min == null ? null : Math.round(n(s.avg_service_min)),
    avgPrepMin: s.avg_prep_min == null ? null : Math.round(n(s.avg_prep_min)),
    byHour,
    topDishes: top.rows.map((r) => ({ name: r.name as { fr: string } & Partial<Record<string, string>>, code: (r.code as string | null) ?? null, qty: n(r.qty) })),
    personnel: people.rows.map((r) => ({
      id: String(r.id),
      name: (r.name as string | null) || String(r.email ?? "").split("@")[0] || "—",
      staffNo: formatStaffNo(r.staff_no as number | null),
      role: String(r.role),
      confirmed: n(r.confirmed),
      prepared: n(r.prepared),
      served: n(r.served),
      cancelled: n(r.cancelled),
      avgServiceMin: r.avg_service_min == null ? null : Math.round(n(r.avg_service_min)),
    })),
  };
}
export type OrderAnalytics = Awaited<ReturnType<typeof orderAnalytics>>;
