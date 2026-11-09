import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { allow, DeviceId, notFound, publicRestaurant, Slug, tooMany } from "@/lib/public-api";
import { findSeat, joinSession } from "@/lib/seating/sessions";

export const dynamic = "force-dynamic";

const Body = z.union([
  z.object({ slug: Slug, deviceId: DeviceId, token: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/) }),
  z.object({
    slug: Slug,
    deviceId: DeviceId,
    seatId: z.uuid(),
    confirmJoin: z.boolean().optional(),
    customerName: z.string().trim().min(1).max(40).optional(),
  }),
]);

/** Open or join the session of a seat (printed QR token, or picker choice). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const body = parsed.data;
  if (!allow(req, body.deviceId)) return tooMany();
  const r = await publicRestaurant(body.slug);
  if (!r) return notFound();
  const db = getDb();
  const seat = await findSeat(db, r.id, "token" in body ? { token: body.token } : { seatId: body.seatId });
  if (!seat) return notFound();
  if ("seatId" in body && seat.type === "counter" && !body.customerName) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }
  const res = await joinSession(db, r, {
    seat: { id: seat.id, type: seat.type, label: seat.label },
    deviceId: body.deviceId,
    source: "token" in body ? "qr" : "picker",
    confirmJoin: "seatId" in body ? body.confirmJoin : true,
    customerName: "customerName" in body ? body.customerName : null,
  });
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: res.reason === "occupied" ? 409 : 404 });
  return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
}
