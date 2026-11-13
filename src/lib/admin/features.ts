import "server-only";
import { sql } from "drizzle-orm";
import type { DB } from "@/db";

/**
 * How the recent customer and service features are used (super admin only): shared selections,
 * tables freed by staff and closed by themselves, reviews, feature switches. Platform-wide, or one
 * business when `restaurantId` is given. Last 30 days unless noted.
 */
export type FeatureUsage = {
  shared: { created: number; sent: number; stopped: number; openNow: number; guests: number; namedLines: number };
  tables: { releasedByStaff: number; closedFinished: number; closedInactive: number; closedExpired: number; closedStale: number; closedByStaff: number; closedByCustomer: number; openNow: number };
  reviews: { count: number; average: number | null; hidden: number; deleted: number };
  switches: { reviewsOff: number; attendanceOff: number; sharingBusinesses: number; reservationsOn: number };
  reservations: { total: number; covers: number; requested: number; confirmed: number; declined: number; cancelled: number; noShow: number; honoured: number; called: number };
};
const n = (v: unknown) => Number(v ?? 0) || 0;

export async function featureUsage(db: DB, restaurantId?: string, now = new Date()): Promise<FeatureUsage> {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const only = (col: string) => (restaurantId ? sql`and ${sql.raw(col)} = ${restaurantId}` : sql``);
  const one = async (s: ReturnType<typeof sql>) => ((await db.execute<Record<string, unknown>>(s)).rows[0] ?? {}) as Record<string, unknown>;

  const [shared, tables, released, reviews, switches] = await Promise.all([
    one(sql`
      select count(*)::int as created,
        count(*) filter (where c.status = 'sent')::int as sent,
        count(*) filter (where c.status = 'closed')::int as stopped,
        count(*) filter (where c.status = 'open' and c.expires_at > now())::int as open_now,
        coalesce(sum((select count(*) from shared_cart_members m where m.cart_id = c.id and m.device_hash <> c.host_device_hash)), 0)::int as guests,
        count(distinct c.restaurant_id)::int as businesses
      from shared_carts c where c.created_at >= ${since} ${only("c.restaurant_id")}`),
    one(sql`
      select count(*) filter (where s.closed_reason = 'finished')::int as finished,
        count(*) filter (where s.closed_reason = 'inactive')::int as inactive,
        count(*) filter (where s.closed_reason = 'expired')::int as expired,
        count(*) filter (where s.closed_reason = 'stale')::int as stale,
        count(*) filter (where s.closed_reason = 'staff')::int as staff,
        count(*) filter (where s.closed_reason = 'released')::int as customer,
        (select count(*) from table_sessions o where o.status = 'open' ${only("o.restaurant_id")})::int as open_now
      from table_sessions s where s.closed_at >= ${since} ${only("s.restaurant_id")}`),
    one(sql`select count(*)::int as n from audit_log a where a.action = 'seating.table.released' and a.created_at >= ${since} ${only("a.restaurant_id")}`),
    one(sql`
      select count(*)::int as count, round(avg(r.rating)::numeric, 1)::float as average,
        count(*) filter (where r.status = 'hidden')::int as hidden,
        count(*) filter (where r.status = 'deleted')::int as deleted
      from reviews r where r.created_at >= ${since} ${only("r.restaurant_id")}`),
    one(sql`
      select count(*) filter (where (x.settings #>> '{features,reviews}') = 'false')::int as reviews_off,
        count(*) filter (where (x.settings #>> '{features,attendance}') = 'false')::int as attendance_off,
        count(*) filter (where (x.settings #>> '{reservations,enabled}') = 'true')::int as reservations_on
      from restaurants x where x.deleted_at is null ${only("x.id")}`),
  ]);
  const resv = await one(sql`
    select count(*)::int as total, coalesce(sum(v.party_size), 0)::int as covers,
      count(*) filter (where v.status = 'requested')::int as requested,
      count(*) filter (where v.status = 'confirmed')::int as confirmed,
      count(*) filter (where v.status = 'declined')::int as declined,
      count(*) filter (where v.status = 'cancelled')::int as cancelled,
      count(*) filter (where v.status = 'no_show')::int as no_show,
      count(*) filter (where v.status in ('seated', 'completed'))::int as honoured,
      count(*) filter (where v.contacted_at is not null)::int as called
    from reservations v where v.created_at >= ${since} ${only("v.restaurant_id")}`);
  const named = await one(sql`
    select count(*)::int as n from order_items i join orders o on o.id = i.order_id
    where o.id in (select c.order_id from shared_carts c where c.status = 'sent' and c.created_at >= ${since} ${only("c.restaurant_id")})`);

  return {
    shared: { created: n(shared.created), sent: n(shared.sent), stopped: n(shared.stopped), openNow: n(shared.open_now), guests: n(shared.guests), namedLines: n(named.n) },
    tables: {
      releasedByStaff: n(released.n),
      closedFinished: n(tables.finished),
      closedInactive: n(tables.inactive),
      closedExpired: n(tables.expired),
      closedStale: n(tables.stale),
      closedByStaff: n(tables.staff),
      closedByCustomer: n(tables.customer),
      openNow: n(tables.open_now),
    },
    reviews: { count: n(reviews.count), average: reviews.average == null ? null : Number(reviews.average), hidden: n(reviews.hidden), deleted: n(reviews.deleted) },
    switches: { reviewsOff: n(switches.reviews_off), attendanceOff: n(switches.attendance_off), sharingBusinesses: n(shared.businesses), reservationsOn: n(switches.reservations_on) },
    reservations: {
      total: n(resv.total),
      covers: n(resv.covers),
      requested: n(resv.requested),
      confirmed: n(resv.confirmed),
      declined: n(resv.declined),
      cancelled: n(resv.cancelled),
      noShow: n(resv.no_show),
      honoured: n(resv.honoured),
      called: n(resv.called),
    },
  };
}
