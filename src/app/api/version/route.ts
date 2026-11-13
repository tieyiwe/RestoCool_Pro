import { NextResponse } from "next/server";
import { buildVersion } from "@/lib/version";

export const dynamic = "force-dynamic";

/** The version now published: open pages compare it with theirs to update themselves. */
export function GET() {
  return NextResponse.json({ v: buildVersion() }, { headers: { "Cache-Control": "no-store" } });
}
