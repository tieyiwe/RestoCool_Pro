import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { ACTIVE_RESTAURANT_COOKIE, getVerifiedEmail } from "@/lib/auth/context";
import { claimBusinessesByEmail } from "@/lib/restaurants/claim";
import { findOwnerInvite } from "@/lib/restaurants/owner-invite";
import { publicBaseUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

/**
 * Takes over the business of an owner invitation: only for the invited email, verified by the
 * sign-in provider. Opens the app on that business (the setup wizard if it is not finished).
 * Anything else goes back to the invitation page, which says what to do.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  // The public address (APP_URL or the forwarded host), never the internal one behind the proxy.
  const base = await publicBaseUrl();
  const page = new URL(`/r/${slug}/proprietaire/${token}`, base);
  const db = getDb();
  const found = await findOwnerInvite(db, slug, token);
  const me = await getVerifiedEmail();
  if (found.state !== "open" || !me || me.email.trim().toLowerCase() !== found.email) return NextResponse.redirect(page, 303);
  const claimed = await claimBusinessesByEmail(db, { clerkUserId: me.userId, verifiedEmail: me.email, name: me.name });
  // Never a loop: the page shows « failed » instead of sending the person back here.
  if (!claimed.includes(found.restaurant.id)) {
    page.searchParams.set("e", "1");
    return NextResponse.redirect(page, 303);
  }
  (await cookies()).set(ACTIVE_RESTAURANT_COOKIE, found.restaurant.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
  return NextResponse.redirect(new URL("/app", base), 303);
}
