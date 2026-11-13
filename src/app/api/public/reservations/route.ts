import { after, NextResponse } from "next/server";
import { getDb } from "@/db";
import { sendReservationEmail } from "@/lib/email/reservation";
import { allow, DeviceId, notFound, publicBusiness, Slug, tooMany } from "@/lib/public-api";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createReservation, ReservationError, ReservationInput, reservationToken } from "@/lib/reservations";
import { sha256 } from "@/lib/tokens";
import { publicBaseUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

const Body = ReservationInput.extend({ slug: Slug, deviceId: DeviceId });

/**
 * A customer asks for a table. Answers the reference and the private link; RestoCool emails the
 * customer (« demande reçue ») in the background. Rate limited per phone and per network.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return NextResponse.json({ error: "invalid_input", field: typeof field === "string" ? field : null }, { status: 400 });
  }
  const { slug, deviceId, ...input } = parsed.data;
  const ip = clientIp(req);
  if (!allow(req, deviceId) || !rateLimit(`resv:${ip}|${deviceId}`, { capacity: 5, refillPerSec: 1 / 300 }) || !rateLimit(`resv-ip:${ip}`, { capacity: 20, refillPerSec: 1 / 60 })) return tooMany();
  const r = await publicBusiness(slug);
  if (!r) return notFound();
  try {
    const db = getDb();
    const { reservation, duplicate } = await createReservation(db, r, input, deviceId);
    if (!duplicate) {
      const base = await publicBaseUrl();
      after(() => sendReservationEmail(db, "requested", reservation, base));
    }
    // The private link only goes back to the phone that made the reservation.
    const mine = reservation.deviceHash === sha256(deviceId);
    return NextResponse.json(
      { ref: reservation.ref, status: reservation.status, duplicate, link: mine ? `/reservation/${reservationToken(reservation.id)}` : null },
      { status: duplicate ? 200 : 201 },
    );
  } catch (err) {
    if (err instanceof ReservationError) return NextResponse.json({ error: err.code }, { status: err.code === "closed" ? 403 : 409 });
    throw err;
  }
}
