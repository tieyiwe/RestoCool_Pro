import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { tableSessions } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { customerSession } from "@/lib/orders/service";
import { allow, DeviceId, notFound, publicRestaurant, Slug, tooMany } from "@/lib/public-api";
import { notify } from "@/lib/realtime/events";
import { GROUP_SEATS } from "@/lib/seating/group-seats";

export const dynamic = "force-dynamic";
const Body = z.object({ slug: Slug, deviceId: DeviceId });

/**
 * « Demander l'addition »: a phone seated at a table or room asks for the bill. The table's server
 * sees « Addition demandée » on « Mes tables » (live). Asking twice changes nothing.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!id.success || !body.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (!allow(req, body.data.deviceId)) return tooMany();
  const r = await publicRestaurant(body.data.slug);
  if (!r) return notFound();
  const db = getDb();
  const s = await customerSession(db, r.id, id.data, body.data.deviceId);
  if (!s || !GROUP_SEATS.has(s.seat.type)) return NextResponse.json({ error: "gone" }, { status: 410 });
  if (!s.session.billRequestedAt) {
    const now = new Date();
    await db.update(tableSessions).set({ billRequestedAt: now }).where(and(eq(tableSessions.id, s.session.id), eq(tableSessions.restaurantId, r.id)));
    await writeAudit(db, { kind: "customer", deviceId: body.data.deviceId, restaurantId: r.id }, { restaurantId: r.id, action: "session.bill_requested", entity: "session", entityId: s.session.id, data: { seat: s.seat.label } });
    await notify(db, { k: "session", r: r.id, s: s.session.id });
  }
  return NextResponse.json({ ok: true, requestedAt: (s.session.billRequestedAt ?? new Date()).toISOString() });
}
