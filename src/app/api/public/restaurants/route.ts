import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { searchRestaurants, suggestByRc } from "@/lib/directory";
import { allow, tooMany } from "@/lib/public-api";

export const dynamic = "force-dynamic";

/** Directory search as you type: name, city or numéro RC. Published restaurants only. */
export async function GET(req: Request) {
  if (!allow(req)) return tooMany();
  const sp = new URL(req.url).searchParams;
  // ?rc=K7 : typeahead on the numéro RC field.
  const rc = sp.get("rc");
  if (rc !== null) return NextResponse.json({ results: await suggestByRc(getDb(), rc.slice(0, 12)) }, { headers: { "Cache-Control": "public, max-age=30" } });
  const q = sp.get("q") ?? "";
  const results = await searchRestaurants(getDb(), q, 24);
  return NextResponse.json({ results }, { headers: { "Cache-Control": "public, max-age=30" } });
}
