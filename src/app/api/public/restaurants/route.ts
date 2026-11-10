import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { searchRestaurants } from "@/lib/directory";
import { allow, tooMany } from "@/lib/public-api";

export const dynamic = "force-dynamic";

/** Directory search as you type: name, city or numéro RC. Published restaurants only. */
export async function GET(req: Request) {
  if (!allow(req)) return tooMany();
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const results = await searchRestaurants(getDb(), q, 24);
  return NextResponse.json({ results }, { headers: { "Cache-Control": "public, max-age=30" } });
}
