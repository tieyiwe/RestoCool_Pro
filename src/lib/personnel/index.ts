import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { members, orders } from "@/db/schema";

export type Person = { id: string; name: string; staffNo: number | null; role: string; active: boolean; email: string | null; hasPin: boolean; lockedUntil: Date | null; hasLogin: boolean };

/** « Matricule » as printed: 001, 002 … */
export const formatStaffNo = (n: number | null | undefined) => (n ? String(n).padStart(3, "0") : "—");

/** Personnel of one restaurant, by matricule. */
export async function personnel(db: DB, restaurantId: string): Promise<Person[]> {
  const rows = await db
    .select({
      id: members.id,
      name: members.name,
      email: members.email,
      staffNo: members.staffNo,
      role: members.role,
      active: members.active,
      hasPin: sql<boolean>`${members.pinHash} is not null`,
      lockedUntil: members.lockedUntil,
      hasLogin: sql<boolean>`${members.clerkUserId} is not null`,
    })
    .from(members)
    .where(eq(members.restaurantId, restaurantId))
    .orderBy(asc(members.staffNo), asc(members.createdAt));
  return rows.map((r) => ({ ...r, name: r.name || r.email?.split("@")[0] || "—" }));
}

/** Next free matricule (never reused: max + 1). Call inside the transaction that inserts the member. */
export async function nextStaffNo(db: Pick<DB, "execute">, restaurantId: string): Promise<number> {
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`staffno:${restaurantId}`}))`);
  const res = await db.execute<{ n: number }>(sql`select coalesce(max(staff_no), 0)::int + 1 as n from members where restaurant_id = ${restaurantId}`);
  return res.rows[0]!.n;
}

/** Orders each person handled (confirmed, prepared, served, cancelled), for the Personnel page. */
export async function handledCounts(db: DB, restaurantId: string, since: Date) {
  const res = await db.execute<{ member_id: string; confirmed: number; prepared: number; served: number; cancelled: number }>(sql`
    select m.id as member_id,
      count(*) filter (where o.confirmed_by = m.id)::int as confirmed,
      count(*) filter (where o.prepared_by = m.id)::int as prepared,
      count(*) filter (where o.served_by = m.id)::int as served,
      count(*) filter (where o.cancelled_by = m.id)::int as cancelled
    from ${members} m
    left join ${orders} o on o.restaurant_id = m.restaurant_id and o.sent_at >= ${since}
      and (o.confirmed_by = m.id or o.prepared_by = m.id or o.served_by = m.id or o.cancelled_by = m.id)
    where m.restaurant_id = ${restaurantId}
    group by m.id`);
  return new Map(res.rows.map((r) => [r.member_id, r]));
}

export function personLookup(list: Person[]) {
  const byId = new Map(list.map((p) => [p.id, p]));
  return (id: string | null) => {
    const p = id ? byId.get(id) : null;
    return p ? { name: p.name, staffNo: formatStaffNo(p.staffNo) } : null;
  };
}
export type PersonRef = { name: string; staffNo: string } | null;

