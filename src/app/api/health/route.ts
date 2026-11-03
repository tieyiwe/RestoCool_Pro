import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

/** Liveness + database check for Replit health checks and uptime monitors. */
export async function GET() {
  const started = Date.now();
  try {
    await getDb().execute(sql`select 1`);
    return NextResponse.json({ status: "ok", db: "ok", latencyMs: Date.now() - started, version: process.env.REPLIT_DEPLOYMENT_ID ?? "dev" });
  } catch {
    return NextResponse.json({ status: "degraded", db: "error" }, { status: 503 });
  }
}
