import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { allow, notFound, publicRestaurant, Slug, tooMany } from "@/lib/public-api";
import { pickerSeats } from "@/lib/seating/sessions";

export const dynamic = "force-dynamic";

/** Seats offered in the seat picker, with « occupied » flags. Never returns QR tokens. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!allow(req)) return tooMany();
  const slug = Slug.safeParse((await params).slug);
  if (!slug.success) return notFound();
  const r = await publicRestaurant(slug.data);
  if (!r) return notFound();
  const seats = await pickerSeats(getDb(), r);
  return NextResponse.json({ seats }, { headers: { "Cache-Control": "no-store" } });
}
