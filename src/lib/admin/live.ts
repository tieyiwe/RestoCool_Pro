import "server-only";
import { sql } from "drizzle-orm";
import type { DB } from "@/db";
import { livePresence, type LiveSnapshot } from "@/lib/usage/presence";

/**
 * Live view of the platform for TIBLOGICS: who has a screen open right now (by audience and
 * device), orders waiting vs processed today (globally and per business), app usage time, and
 * traffic over the last hour, day and month. « Today » is the business day (UTC = Ouagadougou).
 */
const PENDING = sql.raw(`('sent','confirmed','preparing','ready')`);
const PROCESSED = sql.raw(`('served','paid')`);

export type OrdersNow = { pending: number; sent: number; confirmed: number; preparing: number; ready: number; late: number; processedToday: number; cancelledToday: number; avgServeMin: number | null };

export type BusinessLive = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  team: number;
  customers: number;
  pending: number;
  late: number;
  processedToday: number;
  cancelledToday: number;
  appMinutesToday: number;
  activeMembersToday: number;
  lastOrderAt: Date | null;
};

const rows = <T>(r: unknown) => (Array.isArray(r) ? r : ((r as { rows: T[] }).rows ?? [])) as T[];
const n = (v: unknown) => Number(v ?? 0);

export async function ordersNow(db: DB, restaurantId?: string): Promise<OrdersNow> {
  const where = restaurantId ? sql`and restaurant_id = ${restaurantId}` : sql``;
  const [r] = rows<Record<string, unknown>>(
    await db.execute(sql`
      select
        count(*) filter (where status in ${PENDING}) as pending,
        count(*) filter (where status = 'sent') as sent,
        count(*) filter (where status = 'confirmed') as confirmed,
        count(*) filter (where status = 'preparing') as preparing,
        count(*) filter (where status = 'ready') as ready,
        count(*) filter (where status in ${PENDING} and sent_at < now() - interval '15 minutes') as late,
        count(*) filter (where status in ${PROCESSED} and coalesce(served_at, paid_at) >= current_date) as processed_today,
        count(*) filter (where status = 'cancelled' and cancelled_at >= current_date) as cancelled_today,
        avg(extract(epoch from (served_at - sent_at)) / 60) filter (where served_at >= current_date) as avg_serve
      from orders
      where (status in ${PENDING} or sent_at >= current_date - interval '1 day' or served_at >= current_date or cancelled_at >= current_date) ${where}
    `),
  );
  return {
    pending: n(r?.pending),
    sent: n(r?.sent),
    confirmed: n(r?.confirmed),
    preparing: n(r?.preparing),
    ready: n(r?.ready),
    late: n(r?.late),
    processedToday: n(r?.processed_today),
    cancelledToday: n(r?.cancelled_today),
    avgServeMin: r?.avg_serve == null ? null : Math.round(Number(r.avg_serve)),
  };
}

/** One line per business with something going on (live people, orders today or waiting, app use). */
export async function businessesLive(db: DB, presence: LiveSnapshot, opts: { restaurantId?: string } = {}): Promise<BusinessLive[]> {
  const only = opts.restaurantId ? sql`where r.id = ${opts.restaurantId}` : sql``;
  const list = rows<Record<string, unknown>>(
    await db.execute(sql`
      select r.id, r.name, r.slug, r.city,
        coalesce(o.pending, 0) pending, coalesce(o.late, 0) late, coalesce(o.processed, 0) processed, coalesce(o.cancelled, 0) cancelled, o.last_at,
        coalesce(u.minutes, 0) minutes, coalesce(u.members, 0) members
      from restaurants r
      left join (
        select restaurant_id,
          count(*) filter (where status in ${PENDING}) pending,
          count(*) filter (where status in ${PENDING} and sent_at < now() - interval '15 minutes') late,
          count(*) filter (where status in ${PROCESSED} and coalesce(served_at, paid_at) >= current_date) processed,
          count(*) filter (where status = 'cancelled' and cancelled_at >= current_date) cancelled,
          max(sent_at) last_at
        from orders
        where status in ${PENDING} or sent_at >= current_date - interval '1 day' or served_at >= current_date or cancelled_at >= current_date
        group by restaurant_id
      ) o on o.restaurant_id = r.id
      left join (
        select restaurant_id, sum(minutes) minutes, count(distinct member_id) members from app_usage where day = current_date group by restaurant_id
      ) u on u.restaurant_id = r.id
      ${only}
    `),
  );
  return list
    .map((r) => {
      const live = presence.byRestaurant.get(String(r.id)) ?? { team: 0, customers: 0 };
      return {
        id: String(r.id),
        name: String(r.name),
        slug: String(r.slug),
        city: (r.city as string | null) ?? null,
        team: live.team,
        customers: live.customers,
        pending: n(r.pending),
        late: n(r.late),
        processedToday: n(r.processed),
        cancelledToday: n(r.cancelled),
        appMinutesToday: n(r.minutes),
        activeMembersToday: n(r.members),
        lastOrderAt: r.last_at ? new Date(String(r.last_at)) : null,
      };
    })
    .filter((b) => opts.restaurantId || b.team + b.customers + b.pending + b.processedToday + b.cancelledToday + b.appMinutesToday > 0)
    .sort((a, b) => b.pending - a.pending || b.team + b.customers - (a.team + a.customers) || b.processedToday - a.processedToday);
}

export type Traffic = {
  lastHour: Array<{ t: string; n: number }>;
  last24h: Array<{ t: string; n: number }>;
  daily: Array<{ d: string; total: number; owner: number; manager: number; staff: number; customer: number; visitor: number }>;
  devices7: Record<string, number>;
  os7: Record<string, number>;
  installed7: number;
  peakToday: number;
};

export async function traffic(db: DB): Promise<Traffic> {
  const [hour, day, daily, dev, os, inst, peak] = await Promise.all([
    db.execute(sql`
      select to_char(m, 'HH24:MI') t, coalesce(sum(tm.n), 0) n
      from generate_series(date_trunc('minute', now()) - interval '59 minutes', date_trunc('minute', now()), interval '1 minute') m
      left join traffic_minutes tm on tm.minute = m
      group by m order by m`),
    db.execute(sql`
      select to_char(h, 'HH24') || 'h' t, coalesce(max(s.n), 0) n
      from generate_series(date_trunc('hour', now()) - interval '23 hours', date_trunc('hour', now()), interval '1 hour') h
      left join (select minute, sum(n) n from traffic_minutes where minute >= now() - interval '24 hours' group by minute) s on date_trunc('hour', s.minute) = h
      group by h order by h`),
    db.execute(sql`
      select to_char(d, 'YYYY-MM-DD') d,
        count(v.visitor) total,
        count(v.visitor) filter (where v.audience = 'owner') owner,
        count(v.visitor) filter (where v.audience = 'manager') manager,
        count(v.visitor) filter (where v.audience = 'staff') staff,
        count(v.visitor) filter (where v.audience = 'customer') customer,
        count(v.visitor) filter (where v.audience = 'visitor') visitor
      from generate_series(current_date - 29, current_date, interval '1 day') d
      left join traffic_visitors v on v.day = d::date
      group by d order by d`),
    db.execute(sql`select device k, count(*) n from traffic_visitors where day >= current_date - 6 group by device`),
    db.execute(sql`select os k, count(*) n from traffic_visitors where day >= current_date - 6 group by os`),
    db.execute(sql`select count(*) n from traffic_visitors where day >= current_date - 6 and standalone`),
    db.execute(sql`select coalesce(max(s), 0) n from (select sum(n) s from traffic_minutes where minute >= current_date group by minute) x`),
  ]);
  const kv = (r: unknown) => Object.fromEntries(rows<{ k: string; n: unknown }>(r).map((x) => [x.k, n(x.n)]));
  return {
    lastHour: rows<{ t: string; n: unknown }>(hour).map((x) => ({ t: x.t, n: n(x.n) })),
    last24h: rows<{ t: string; n: unknown }>(day).map((x) => ({ t: x.t, n: n(x.n) })),
    daily: rows<Record<string, unknown>>(daily).map((x) => ({
      d: String(x.d),
      total: n(x.total),
      owner: n(x.owner),
      manager: n(x.manager),
      staff: n(x.staff),
      customer: n(x.customer),
      visitor: n(x.visitor),
    })),
    devices7: kv(dev),
    os7: kv(os),
    installed7: n(rows<{ n: unknown }>(inst)[0]?.n),
    peakToday: n(rows<{ n: unknown }>(peak)[0]?.n),
  };
}

export async function liveOverview(db: DB) {
  const presence = livePresence();
  const [orders, businesses, tr] = await Promise.all([ordersNow(db), businessesLive(db, presence), traffic(db)]);
  return { presence, orders, businesses, traffic: tr };
}
