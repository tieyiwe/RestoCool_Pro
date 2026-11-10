import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { requireSuperadmin } from "@/lib/auth/context";
import { handle } from "@/lib/http";
import { platformLocations } from "@/lib/platform/locations";

export const dynamic = "force-dynamic";

/** GeoJSON of all located businesses, for the platform map in the admin console (super admin only). */
export const GET = handle(async () => {
  await requireSuperadmin();
  return NextResponse.json(await platformLocations(getDb()), { headers: { "Cache-Control": "private, no-store" } });
});
