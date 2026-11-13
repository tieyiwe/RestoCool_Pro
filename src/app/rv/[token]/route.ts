import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { ACTIVE_RESTAURANT_COOKIE, getIdentity, getMemberContext, getMemberships } from "@/lib/auth/context";
import { reservationByCheckin } from "@/lib/reservations";

export const dynamic = "force-dynamic";

/** Same-site redirect with a relative Location (behind Replit's proxy req.url is 0.0.0.0). */
const goTo = (path: string) => new NextResponse(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });
const Token = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

/**
 * The reservation check-in QR (from the confirmation email), scanned with any camera. Staff of
 * that business (account or PIN tablet) go to the check-in screen; anyone else, the guest
 * included, gets a page saying to show it to the staff. No reservation details outside the app.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = Token.safeParse((await params).token);
  if (!token.success) return goTo("/rv/x/aide");
  const help = (state: string) => goTo(`/rv/${token.data}/aide?state=${state}`);
  const row = await reservationByCheckin(getDb(), null, token.data);
  if (!row) return help("unknown");
  const app = `/app/reservations/checkin/${token.data}`;
  const ctx = await getMemberContext();
  if (ctx && ctx.actor.kind === "member" && "via" in ctx.actor && ctx.actor.via === "pin") {
    return ctx.actor.restaurantId === row.restaurantId ? goTo(app) : help("guest");
  }
  if (!(await getIdentity())) return help("guest");
  const memberships = await getMemberships();
  if (!memberships.some((m) => m.restaurantId === row.restaurantId)) return help("guest");
  const res = goTo(app);
  if ((await cookies()).get(ACTIVE_RESTAURANT_COOKIE)?.value !== row.restaurantId) {
    res.cookies.set(ACTIVE_RESTAURANT_COOKIE, row.restaurantId, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}
