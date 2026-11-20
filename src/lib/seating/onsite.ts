import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { restaurants, seats } from "@/db/schema";

type Restaurant = typeof restaurants.$inferSelect;
import { serviceTypes } from "@/lib/restaurants/service-types";
import { randomToken } from "@/lib/tokens";

/** Label of the automatic « Sur place » place (a counter-type seat: the customer gives a first name). */
export const ONSITE_LABEL = "Sur place";

/** Places a dine-in customer can sit at, other than the automatic « Sur place ». */
const DINE_IN_TYPES = ["table", "room", "area", "counter"] as const;

/**
 * A business that serves on site but has no table, room, area or counter set up yet (or not
 * numbered at all) still takes dine-in orders: one automatic « Sur place » place where the customer
 * types their first name. It switches itself off as soon as the owner adds real places (customers
 * then pick their table or room) and back on if they are all removed. Writes only when that
 * changes. Returns the id of the « Sur place » place while it is on, else null.
 */
export async function syncOnsiteSeat(db: DB, r: Restaurant): Promise<string | null> {
  const known = r.settings.onsiteSeatId ?? null;
  const wanted = r.kind !== "transport" && serviceTypes(r.settings).dineIn;
  let real = 0;
  if (wanted) {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(seats)
      .where(and(eq(seats.restaurantId, r.id), eq(seats.active, true), inArray(seats.type, [...DINE_IN_TYPES]), ...(known ? [ne(seats.id, known)] : [])));
    real = row?.n ?? 0;
  }
  const on = wanted && real === 0;
  const current = known ? await db.query.seats.findFirst({ where: and(eq(seats.restaurantId, r.id), eq(seats.id, known)) }) : null;
  if (!on) {
    if (current?.active) await db.update(seats).set({ active: false }).where(eq(seats.id, current.id));
    return null;
  }
  if (current) {
    if (!current.active) await db.update(seats).set({ active: true }).where(eq(seats.id, current.id));
    return current.id;
  }
  const [created] = await db.insert(seats).values({ restaurantId: r.id, type: "counter", label: ONSITE_LABEL, qrToken: randomToken(), sort: 0 }).returning({ id: seats.id });
  // Recorded only if no other request recorded one meanwhile; otherwise ours is removed.
  const [kept] = await db
    .update(restaurants)
    .set({ settings: sql`${restaurants.settings} || jsonb_build_object('onsiteSeatId', ${created!.id}::text)` })
    .where(and(eq(restaurants.id, r.id), sql`not (${restaurants.settings} ? 'onsiteSeatId') or ${restaurants.settings}->>'onsiteSeatId' = ${known ?? ""}`))
    .returning({ id: restaurants.id });
  if (!kept) {
    await db.delete(seats).where(eq(seats.id, created!.id));
    const fresh = await db.query.restaurants.findFirst({ where: eq(restaurants.id, r.id) });
    return fresh?.settings.onsiteSeatId ?? null;
  }
  r.settings = { ...r.settings, onsiteSeatId: created!.id };
  return created!.id;
}

/** Is this the automatic « Sur place » place of this business? */
export function isOnsiteSeat(r: Pick<Restaurant, "settings">, seat: { id?: string }): boolean {
  return !!seat.id && seat.id === r.settings.onsiteSeatId;
}
