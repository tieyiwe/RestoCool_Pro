import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { findRestaurantBySlug } from "@/db/repos/tenant";
import { customerSession, GROUP_SEATS } from "@/lib/orders/service";
import { allow, DeviceId, notFound, publicRestaurant, Slug, tooMany } from "@/lib/public-api";
import { sseResponse } from "@/lib/realtime/sse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Query = z.object({ slug: Slug, deviceId: DeviceId, sessionId: z.uuid().optional() });

/**
 * Customer live stream: menu changes (sold out), this phone's orders, and, at a shared table
 * it is seated at, the table's orders. Nothing from other customers or other restaurants.
 */
export async function GET(req: Request) {
  const q = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (!allow(req, q.data.deviceId)) return tooMany();
  const db = getDb();
  // Published menus, or a member previewing their unpublished one.
  const r = (await findRestaurantBySlug(db, q.data.slug)) ?? (await publicRestaurant(q.data.slug));
  if (!r) return notFound();
  const s = q.data.sessionId ? await customerSession(db, r.id, q.data.sessionId, q.data.deviceId) : null;
  const sessionId = s?.session.id ?? null;
  const shared = s && GROUP_SEATS.has(s.seat.type) ? sessionId : null;
  const deviceId = q.data.deviceId;
  return sseResponse(req, (ev) => {
    if (ev.r !== r.id) return null;
    if (ev.k === "menu") return "menu";
    if (ev.k === "session") return ev.s === sessionId ? "session" : null;
    // Team requests are for staff screens only.
    if (ev.k !== "order") return null;
    return ev.d === deviceId || (shared !== null && ev.s === shared) ? "order" : null;
  });
}
