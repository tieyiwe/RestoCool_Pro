import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { restaurants } from "@/db/schema";
import { allow, notFound, tooMany } from "@/lib/public-api";
import { brandedQrPng } from "@/lib/qr-branded";
import { qrValid, reservationByCheckin, reservationConfig } from "@/lib/reservations";
import { publicBaseUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

/**
 * The check-in QR as a PNG (for the confirmation email, where SVG and data: images are blocked).
 * Gone (404) once used, expired or cancelled. Path: /api/public/reservations/qr/<token>.png
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!allow(req)) return tooMany();
  const token = (await params).token.replace(/\.png$/, "");
  const db = getDb();
  const row = await reservationByCheckin(db, null, token);
  if (!row) return notFound();
  const [r] = await db.select({ settings: restaurants.settings }).from(restaurants).where(eq(restaurants.id, row.restaurantId));
  if (!r || !qrValid(row, reservationConfig(r))) return notFound();
  const png = brandedQrPng(`${await publicBaseUrl()}/rv/${token}`, { width: 480 });
  return new NextResponse(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=300" } });
}
