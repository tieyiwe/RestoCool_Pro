"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { cleanAccess } from "@/lib/auth/access";
import { can, type Actor } from "@/lib/auth/can";
import { DEVICE_COOKIE, deviceFromToken, endSession, pinLogin, staffSessionSettings, STAFF_COOKIE } from "@/lib/devices";
import { ipFromHeaders, rateLimit } from "@/lib/rate-limit";

export type PinState = undefined | { error: "unknown" | "wrong_pin" | "locked" | "device" | "too_many"; triesLeft?: number; minutesLeft?: number };

/** PIN typed on the authorised device: opens the person's session and their first screen. */
export async function pinLoginAction(_prev: PinState, fd: FormData): Promise<PinState> {
  const jar = await cookies();
  const db = getDb();
  const dev = await deviceFromToken(db, jar.get(DEVICE_COOKIE)?.value);
  if (!dev) return { error: "device" };
  const ip = ipFromHeaders(await headers());
  if (!rateLimit(`pin:${dev.device.id}:${ip}`, { capacity: 15, refillPerSec: 1 / 4 })) return { error: "too_many" };
  const res = await pinLogin(db, dev.device, dev.restaurant, String(fd.get("memberId") ?? ""), String(fd.get("pin") ?? ""));
  if (!res.ok) return { error: res.error, triesLeft: res.triesLeft, minutesLeft: res.minutesLeft };
  const { shiftHours } = staffSessionSettings(dev.restaurant);
  jar.set(STAFF_COOKIE, res.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: shiftHours * 3600 });
  // Open the screen this person works on.
  const m = await db.query.members.findFirst({ where: (x, { eq }) => eq(x.id, res.memberId) });
  const role = m?.jobRoleId ? await db.query.jobRoles.findFirst({ where: (x, { eq }) => eq(x.id, m.jobRoleId!) }) : null;
  const actor: Actor = { kind: "member", userId: `pin:${res.memberId}`, restaurantId: dev.restaurant.id, role: m?.role ?? "server", memberId: res.memberId, via: "pin", ...(role ? { access: cleanAccess(role.access) } : {}) };
  const allowed = (a: Parameters<typeof can>[1]) => can(actor, a, { restaurantId: dev.restaurant.id });
  redirect(allowed("orders.prepare") && !allowed("orders.confirm") ? "/app/kitchen" : allowed("orders.read") ? "/app/service" : "/app");
}

/** « Verrouiller »: ends the session; the tablet goes back to the PIN pad for the next person. */
export async function lockAction(fd?: FormData) {
  const jar = await cookies();
  await endSession(getDb(), jar.get(STAFF_COOKIE)?.value, fd?.get("reason") === "idle" ? "idle" : "lock");
  jar.delete(STAFF_COOKIE);
  redirect(fd?.get("reason") === "idle" ? "/poste?locked=idle" : "/poste?locked=1");
}
