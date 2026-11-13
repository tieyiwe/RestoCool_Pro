import { and, eq, gt, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { findRestaurantBySlug } from "@/db/repos/tenant";
import { menuItems } from "@/db/schema";
import { allow, notFound, Slug, tooMany } from "@/lib/public-api";
import { currentWait } from "@/lib/reservations";

export const dynamic = "force-dynamic";

/** Dishes sold out or hidden right now, and the current wait, so an open menu updates live without reloading. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = Slug.safeParse((await params).slug);
  if (!slug.success) return notFound();
  if (!allow(req)) return tooMany();
  const db = getDb();
  const r = await findRestaurantBySlug(db, slug.data);
  if (!r) return notFound();
  const rows = await db
    .select({ id: menuItems.id, note: menuItems.unavailableNote, until: menuItems.soldOutUntil })
    .from(menuItems)
    .where(and(eq(menuItems.restaurantId, r.id), or(gt(menuItems.soldOutUntil, new Date()), eq(menuItems.available, false))));
  const now = Date.now();
  const notes = Object.fromEntries(rows.filter((x) => x.note && x.until && x.until.getTime() > now).map((x) => [x.id, x.note]));
  const w = currentWait(r);
  return NextResponse.json({ soldOut: rows.map((x) => x.id), notes, wait: w ? { minutes: w.minutes, note: w.note } : null }, { headers: { "Cache-Control": "no-store" } });
}
