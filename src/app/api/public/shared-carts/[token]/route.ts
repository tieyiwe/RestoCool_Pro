import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { allow, DeviceId, notFound, publicRestaurant, Slug, tooMany } from "@/lib/public-api";
import { finishSharedCart, MemberInput, saveMember, SharedCartError, viewSharedCart } from "@/lib/shared-carts";

export const dynamic = "force-dynamic";

const Token = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);
const Query = z.object({ slug: Slug, deviceId: DeviceId });

const fail = (err: unknown) => {
  if (err instanceof SharedCartError) return NextResponse.json({ error: err.code }, { status: err.code === "not_found" ? 404 : err.code === "host" ? 403 : 409 });
  throw err;
};

/** A shared selection as this phone sees it (host or guest). */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = Token.safeParse((await params).token);
  const q = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!token.success || !q.success) return notFound();
  if (!allow(req, q.data.deviceId)) return tooMany();
  const r = await publicRestaurant(q.data.slug);
  if (!r) return notFound();
  const view = await viewSharedCart(getDb(), r.id, token.data, q.data.deviceId);
  if (!view) return notFound();
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}

const Save = MemberInput.extend({ slug: Slug, deviceId: DeviceId });

/** A guest saves their dishes, their name and « j'ai terminé ». */
export async function PUT(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = Token.safeParse((await params).token);
  const p = Save.safeParse(await req.json().catch(() => null));
  if (!token.success || !p.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (!allow(req, p.data.deviceId)) return tooMany();
  const r = await publicRestaurant(p.data.slug);
  if (!r) return notFound();
  try {
    await saveMember(getDb(), r.id, token.data, p.data.deviceId, { name: p.data.name, lines: p.data.lines, done: p.data.done });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

const Finish = z.object({ slug: Slug, deviceId: DeviceId, orderId: z.uuid().nullable() });

/** The host ends the sharing (order sent, or stopped). */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = Token.safeParse((await params).token);
  const p = Finish.safeParse(await req.json().catch(() => null));
  if (!token.success || !p.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (!allow(req, p.data.deviceId)) return tooMany();
  const r = await publicRestaurant(p.data.slug);
  if (!r) return notFound();
  try {
    await finishSharedCart(getDb(), r.id, token.data, p.data.deviceId, p.data.orderId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
