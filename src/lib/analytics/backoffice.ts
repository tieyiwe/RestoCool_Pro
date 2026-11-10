import "server-only";
import { sql } from "drizzle-orm";
import type { DB } from "@/db";
import { formatStaffNo } from "@/lib/personnel";
import { rangeStart, type Range } from "./orders";

const n = (v: unknown) => Number(v ?? 0);

/** How each kind of activity counts in the ranking (shown to the owner under the table). */
export const SCORE_WEIGHTS = { served: 3, confirmed: 2, prepared: 2, taken: 2, hour: 1, day: 2, appAction: 1 } as const;
/** App actions count up to this many per period, so clicking around never beats real work. */
export const APP_ACTIONS_CAP = 50;

export type RankedPerson = {
  id: string;
  name: string;
  staffNo: string;
  role: string;
  roleKey: string | null;
  roleName: string | null;
  served: number;
  confirmed: number;
  prepared: number;
  taken: number;
  minutes: number;
  days: number;
  appActions: number;
  lastSeenAt: Date | null;
  score: number;
  rank: number;
};

export function scoreOf(p: Pick<RankedPerson, "served" | "confirmed" | "prepared" | "taken" | "minutes" | "days" | "appActions">): number {
  const w = SCORE_WEIGHTS;
  return (
    p.served * w.served +
    p.confirmed * w.confirmed +
    p.prepared * w.prepared +
    p.taken * w.taken +
    Math.floor(p.minutes / 60) * w.hour +
    p.days * w.day +
    Math.min(p.appActions, APP_ACTIONS_CAP) * w.appAction
  );
}

/**
 * Personnel ranked by activity over the period: orders they handled, time checked in, days
 * present, and how much they use the app for the business (actions recorded in the audit log).
 * The owner is not ranked. Ties share a rank.
 */
export async function personnelRanking(db: DB, restaurantId: string, range: Range, now = new Date()): Promise<RankedPerson[]> {
  const from = rangeStart(range, now);
  const res = await db.execute(sql`
    select m.id, m.name, m.email, m.staff_no, m.role, m.last_seen_at, jr.key as role_key, jr.name as role_name,
      (select count(*) from orders o where o.restaurant_id = m.restaurant_id and o.sent_at >= ${from} and o.served_by = m.id)::int as served,
      (select count(*) from orders o where o.restaurant_id = m.restaurant_id and o.sent_at >= ${from} and o.confirmed_by = m.id)::int as confirmed,
      (select count(*) from orders o where o.restaurant_id = m.restaurant_id and o.sent_at >= ${from} and o.prepared_by = m.id)::int as prepared,
      (select count(*) from orders o where o.restaurant_id = m.restaurant_id and o.sent_at >= ${from} and o.taken_by = m.id)::int as taken,
      (select coalesce(sum(extract(epoch from (least(coalesce(a.check_out_at, ${now}), ${now}) - greatest(a.check_in_at, ${from}))) / 60), 0)
         from attendance a where a.restaurant_id = m.restaurant_id and a.member_id = m.id
           and coalesce(a.check_out_at, ${now}) > ${from})::int as minutes,
      (select count(distinct (a.check_in_at at time zone 'Africa/Ouagadougou')::date)
         from attendance a where a.restaurant_id = m.restaurant_id and a.member_id = m.id and a.check_in_at >= ${from})::int as days,
      (select count(*) from audit_log l where l.restaurant_id = m.restaurant_id and l.created_at >= ${from}
         and (l.actor_id = m.clerk_user_id or l.actor_id = m.id::text))::int as app_actions
    from members m
    left join job_roles jr on jr.id = m.job_role_id
    where m.restaurant_id = ${restaurantId} and m.role <> 'owner' and m.active
  `);
  const list = res.rows.map((r) => {
    const p = {
      id: String(r.id),
      name: (r.name as string | null) || String(r.email ?? "").split("@")[0] || "—",
      staffNo: formatStaffNo(r.staff_no as number | null),
      role: String(r.role),
      roleKey: (r.role_key as string | null) ?? null,
      roleName: (r.role_name as string | null) ?? null,
      served: n(r.served),
      confirmed: n(r.confirmed),
      prepared: n(r.prepared),
      taken: n(r.taken),
      minutes: Math.max(0, n(r.minutes)),
      days: n(r.days),
      appActions: n(r.app_actions),
      lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at as string) : null,
      score: 0,
      rank: 0,
    };
    p.score = scoreOf(p);
    return p;
  });
  list.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  list.forEach((p, i) => (p.rank = i > 0 && list[i - 1]!.score === p.score ? list[i - 1]!.rank : i + 1));
  return list;
}

/** What needs the owner's eye right now (shown at the top of the back office). */
export async function liveStatus(db: DB, restaurantId: string, now = new Date()) {
  const today = rangeStart("today", now);
  const res = await db.execute(sql`
    select
      (select count(*) from orders where restaurant_id = ${restaurantId} and status in ('sent','confirmed','preparing','ready'))::int as open_orders,
      (select count(*) from orders where restaurant_id = ${restaurantId} and status = 'sent' and sent_at < ${new Date(now.getTime() - 5 * 60_000)})::int as waiting_orders,
      (select count(*) from orders where restaurant_id = ${restaurantId} and status = 'ready')::int as ready_orders,
      (select count(*) from orders where restaurant_id = ${restaurantId} and sent_at >= ${today} and status <> 'cancelled')::int as orders_today,
      (select coalesce(sum(subtotal), 0) from orders where restaurant_id = ${restaurantId} and sent_at >= ${today} and status in ('served','paid'))::int as revenue_today,
      (select count(*) from attendance where restaurant_id = ${restaurantId} and check_out_at is null)::int as present,
      (select count(*) from members where restaurant_id = ${restaurantId} and active and locked_until > ${now})::int as locked,
      (select count(*) from menu_items where restaurant_id = ${restaurantId} and (not available or sold_out_until > ${now}))::int as sold_out
  `);
  const r = res.rows[0] ?? {};
  return {
    openOrders: n(r.open_orders),
    waitingOrders: n(r.waiting_orders),
    readyOrders: n(r.ready_orders),
    ordersToday: n(r.orders_today),
    revenueToday: n(r.revenue_today),
    present: n(r.present),
    locked: n(r.locked),
    soldOut: n(r.sold_out),
  };
}
