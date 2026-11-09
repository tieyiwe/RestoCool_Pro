import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { allow, DeviceId, notFound, publicRestaurant, Slug, tooMany } from "@/lib/public-api";
import { leaveSession } from "@/lib/seating/sessions";

export const dynamic = "force-dynamic";
const Body = z.object({ slug: Slug, deviceId: DeviceId, reason: z.enum(["released", "inactive"]) });

/** This phone leaves the seat (changed seat, or inactivity release). Also accepts sendBeacon (text body). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  let raw: unknown = null;
  try {
    raw = JSON.parse(await req.text());
  } catch {
    /* invalid */
  }
  const body = Body.safeParse(raw);
  if (!id.success || !body.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (!allow(req, body.data.deviceId)) return tooMany();
  const r = await publicRestaurant(body.data.slug);
  if (!r) return notFound();
  await leaveSession(getDb(), r.id, id.data, body.data.deviceId, body.data.reason);
  return NextResponse.json({ ok: true });
}
