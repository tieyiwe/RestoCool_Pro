import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { allow, DeviceId, notFound, publicRestaurant, Slug, tooMany } from "@/lib/public-api";
import { heartbeat } from "@/lib/seating/sessions";

export const dynamic = "force-dynamic";
const Body = z.object({ slug: Slug, deviceId: DeviceId });

/** Activity ping (throttled by the client). 410 = the seat was released, the phone must pick again. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!id.success || !body.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (!allow(req, body.data.deviceId)) return tooMany();
  const r = await publicRestaurant(body.data.slug);
  if (!r) return notFound();
  const alive = await heartbeat(getDb(), r.id, id.data, body.data.deviceId);
  return alive ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "gone" }, { status: 410 });
}
