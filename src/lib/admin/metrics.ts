import "server-only";
import { sql } from "drizzle-orm";
import type { DB } from "@/db";
import { PLANS, type PlanId, type PlanStatus } from "@/config/plans";
import { effectiveStatus } from "@/lib/plan";

/**
 * Platform statistics for the super admin (TIBLOGICS). Platform-wide reads: only ever called
 * behind requireSuperadmin(). Money in integer FCFA; « today » is the business day (UTC =
 * Ouagadougou).
 */
type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0) || 0;

export async function platformOverview(db: DB, now = new Date()) {
  const day = (n: number) => new Date(now.getTime() - n * 86_400_000);
  const q = async <T extends Row>(s: ReturnType<typeof sql>) => (await db.execute<T>(s)).rows;

  const [biz] = await q(sql`
    select count(*)::int as total,
      count(*) filter (where published)::int as published,
      count(*) filter (where kind = 'transport')::int as transport,
      count(*) filter (where created_at >= ${day(7)})::int as new7,
      count(*) filter (where created_at >= ${day(30)})::int as new30,
      count(*) filter (where (settings->>'onboardedAt') is not null)::int as setup_done
    from restaurants`);
  const [ord] = await q(sql`
    select count(*) filter (where business_date = ${now.toISOString().slice(0, 10)})::int as today,
      count(*) filter (where sent_at >= ${day(7)})::int as last7,
      count(*)::int as last30,
      coalesce(sum(subtotal) filter (where status <> 'cancelled'), 0)::bigint as gmv30,
      coalesce(sum(subtotal) filter (where status <> 'cancelled' and sent_at >= ${day(7)}), 0)::bigint as gmv7,
      count(distinct restaurant_id) filter (where sent_at >= ${day(7)})::int as active7,
      count(distinct restaurant_id)::int as active30
    from orders where sent_at >= ${day(30)}`);
  const [funnel] = await q(sql`
    select count(*)::int as created,
      count(*) filter (where (r.settings->>'onboardedAt') is not null)::int as setup,
      count(*) filter (where exists (select 1 from menu_items m where m.restaurant_id = r.id))::int as menu,
      count(*) filter (where r.published)::int as published,
      count(*) filter (where exists (select 1 from orders o where o.restaurant_id = r.id))::int as ordered
    from restaurants r`);

  // Plans: effective status (a trial past its date counts as late unless the launch offer is on).
  const plans = await q<{ plan: PlanId; plan_status: PlanStatus; plan_expires_at: Date | null }>(sql`select plan, plan_status, plan_expires_at from restaurants`);
  const byPlan: Record<string, number> = {};
  let mrr = 0;
  let potentialMrr = 0;
  for (const p of plans) {
    const status = effectiveStatus({ plan: p.plan, planStatus: p.plan_status, planExpiresAt: p.plan_expires_at ? new Date(p.plan_expires_at) : null }, now);
    byPlan[`${p.plan}:${status}`] = (byPlan[`${p.plan}:${status}`] ?? 0) + 1;
    if (status === "active") mrr += PLANS[p.plan].priceMonthly;
    if (status === "trial" || status === "past_due") potentialMrr += PLANS[p.plan].priceMonthly;
  }
  const [paid] = await q(sql`select coalesce(sum(amount), 0)::bigint as paid30, count(*) filter (where amount > 0)::int as payments30 from plan_events where created_at >= ${day(30)}`);

  const ordersPerDay = await q<{ d: string; n: number; gmv: number }>(sql`
    select business_date::text as d, count(*)::int as n, coalesce(sum(subtotal) filter (where status <> 'cancelled'), 0)::bigint as gmv
    from orders where sent_at >= ${day(30)} group by 1 order by 1`);
  const signupsPerWeek = await q<{ w: string; n: number }>(sql`
    select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') as w, count(*)::int as n
    from restaurants where created_at >= ${day(12 * 7)} group by 1 order by 1`);
  const top = await q<{ id: string; name: string; slug: string; city: string | null; n: number; gmv: number }>(sql`
    select r.id, r.name, r.slug, r.city, count(o.id)::int as n, coalesce(sum(o.subtotal) filter (where o.status <> 'cancelled'), 0)::bigint as gmv
    from orders o join restaurants r on r.id = o.restaurant_id
    where o.sent_at >= ${day(30)} group by r.id order by n desc limit 8`);
  const cities = await q<{ city: string; n: number }>(sql`select coalesce(nullif(city, ''), '—') as city, count(*)::int as n from restaurants group by 1 order by n desc limit 8`);
  const expiring = await q<{ id: string; name: string; plan: PlanId; plan_status: PlanStatus; plan_expires_at: Date }>(sql`
    select id, name, plan, plan_status, plan_expires_at from restaurants
    where plan <> 'gratuit' and plan_expires_at is not null and plan_expires_at < ${new Date(now.getTime() + 14 * 86_400_000)} and plan_status <> 'suspended'
    order by plan_expires_at limit 12`);
  const [errs] = await q(sql`select count(*) filter (where resolved_at is null)::int as open, count(*) filter (where resolved_at is null and last_at >= ${day(1)})::int as today from app_errors`);

  return {
    businesses: { total: num(biz?.total), published: num(biz?.published), transport: num(biz?.transport), new7: num(biz?.new7), new30: num(biz?.new30), setupDone: num(biz?.setup_done) },
    orders: { today: num(ord?.today), last7: num(ord?.last7), last30: num(ord?.last30), gmv7: num(ord?.gmv7), gmv30: num(ord?.gmv30), active7: num(ord?.active7), active30: num(ord?.active30) },
    funnel: { created: num(funnel?.created), setup: num(funnel?.setup), menu: num(funnel?.menu), published: num(funnel?.published), ordered: num(funnel?.ordered) },
    plans: { byPlan, mrr, potentialMrr, paid30: num(paid?.paid30), payments30: num(paid?.payments30) },
    series: {
      ordersPerDay: ordersPerDay.map((r) => ({ d: r.d, n: num(r.n), gmv: num(r.gmv) })),
      signupsPerWeek: signupsPerWeek.map((r) => ({ w: r.w, n: num(r.n) })),
    },
    top: top.map((r) => ({ ...r, n: num(r.n), gmv: num(r.gmv) })),
    cities: cities.map((r) => ({ city: r.city, n: num(r.n) })),
    expiring: expiring.map((r) => ({ ...r, plan_expires_at: new Date(r.plan_expires_at) })),
    errors: { open: num(errs?.open), today: num(errs?.today) },
  };
}
export type PlatformOverview = Awaited<ReturnType<typeof platformOverview>>;
