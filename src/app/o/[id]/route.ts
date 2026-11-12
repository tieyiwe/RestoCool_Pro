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
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  const help = (state: string) => NextResponse.redirect(new URL(`/o/${id.success ? id.data : "x"}/aide?state=${state}`, req.url), 303);
  if (!id.success) return help("unknown");
  const [order] = await getDb().select({ restaurantId: orders.restaurantId }).from(orders).where(eq(orders.id, id.data)).limit(1);
  if (!order) return help("unknown");

  const ctx = await getMemberContext();
  // PIN session on the restaurant tablet: bound to one restaurant.
  if (ctx && ctx.actor.kind === "member" && "via" in ctx.actor && ctx.actor.via === "pin") {
    return ctx.actor.restaurantId === order.restaurantId ? NextResponse.redirect(new URL(`/app/orders/${id.data}`, req.url), 303) : help("notmember");
  }
  const identity = await getIdentity();
  if (!identity) return help("signin");
  const memberships = await getMemberships();
  if (!memberships.some((m) => m.restaurantId === order.restaurantId)) return help("notmember");
  const res = NextResponse.redirect(new URL(`/app/orders/${id.data}`, req.url), 303);
  if ((await cookies()).get(ACTIVE_RESTAURANT_COOKIE)?.value !== order.restaurantId) {
    res.cookies.set(ACTIVE_RESTAURANT_COOKIE, order.restaurantId, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
  }
  return res;
}
