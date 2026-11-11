import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { allow, notFound, publicRestaurant, Slug, tooMany } from "@/lib/public-api";
import { busPicker } from "@/lib/seating/sessions";

export const dynamic = "force-dynamic";

/** Bus seat map(s) for the traveler's seat picker (?b=<bus QR token> for one bus). Never returns tokens. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!allow(req)) return tooMany();
  const slug = Slug.safeParse((await params).slug);
  if (!slug.success) return notFound();
  const r = await publicRestaurant(slug.data);
  if (!r || r.kind !== "transport") return notFound();
  const b = new URL(req.url).searchParams.get("b");
  const token = b && /^[A-Za-z0-9_-]{16,128}$/.test(b) ? b : null;
  return NextResponse.json({ buses: await busPicker(getDb(), r, token) }, { headers: { "Cache-Control": "no-store" } });
}
