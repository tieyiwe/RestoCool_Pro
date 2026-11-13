import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { allow, notFound, publicBusiness, Slug, tooMany } from "@/lib/public-api";
import { reservationConfig, reservationsOpen, slotsFor } from "@/lib/reservations";

export const dynamic = "force-dynamic";

const Query = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

/** Reservation form data: open or not, the rules, and the free times of a day. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = Slug.safeParse((await params).slug);
  const q = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!slug.success || !q.success) return notFound();
  if (!allow(req)) return tooMany();
  const r = await publicBusiness(slug.data);
  if (!r) return notFound();
  if (!reservationsOpen(r)) return NextResponse.json({ open: false }, { headers: { "Cache-Control": "no-store" } });
  const cfg = reservationConfig(r);
  const slots = q.data.date ? await slotsFor(getDb(), r, q.data.date) : [];
  return NextResponse.json(
    { open: true, maxParty: cfg.maxParty, daysAhead: cfg.daysAhead, note: cfg.note ?? null, slots },
    { headers: { "Cache-Control": "no-store" } },
  );
}
