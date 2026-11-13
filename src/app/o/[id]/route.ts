import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { ACTIVE_RESTAURANT_COOKIE, getIdentity, getMemberContext, getMemberships } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

/**
 * The « Montrer au serveur » QR, scanned with any camera. A member of the order's restaurant
 * (account or PIN session on the restaurant tablet) goes straight to the order, switched to that
 * restaurant if they work in several; anyone else gets a page explaining how to sign in or join
 * the team. The order's content is only ever shown inside the staff app.
 */
/**
 * Redirect to a path on the same site. The Location is relative on purpose: behind Replit's proxy
 * `req.url` is the server's own address (http://0.0.0.0:5000/…), which a phone cannot open.
 */
const goTo = (path: string) => new NextResponse(null, { status: 303, headers: { Location: path, "Cache-Control": "no-store" } });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  const help = (state: string) => goTo(`/o/${id.success ? id.data : "x"}/aide?state=${state}`);
  if (!id.success) return help("unknown");
  const [order] = await getDb().select({ restaurantId: orders.restaurantId }).from(orders).where(eq(orders.id, id.data)).limit(1);
  if (!order) return help("unknown");

  const ctx = await getMemberContext();
  // PIN session on the restaurant tablet: bound to one restaurant.
  if (ctx && ctx.actor.kind === "member" && "via" in ctx.actor && ctx.actor.via === "pin") {
    return ctx.actor.restaurantId === order.restaurantId ? goTo(`/app/orders/${id.data}`) : help("notmember");
  }
  const identity = await getIdentity();
  if (!identity) return help("signin");
  const memberships = await getMemberships();
  if (!memberships.some((m) => m.restaurantId === order.restaurantId)) return help("notmember");
  const res = goTo(`/app/orders/${id.data}`);
  if ((await cookies()).get(ACTIVE_RESTAURANT_COOKIE)?.value !== order.restaurantId) {
    res.cookies.set(ACTIVE_RESTAURANT_COOKIE, order.restaurantId, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}
