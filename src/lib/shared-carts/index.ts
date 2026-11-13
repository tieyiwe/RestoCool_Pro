import "server-only";
import { and, asc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { orders, sharedCartMembers, sharedCarts } from "@/db/schema";
import { OrderLineInput } from "@/lib/orders/service";
import { randomToken, sha256 } from "@/lib/tokens";

export const SHARED_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_MEMBERS = 12;

export const SharedLineInput = OrderLineInput.extend({ key: z.string().min(1).max(200) });
export const Name = z.string().trim().min(1).max(40);
export const MemberInput = z.object({
  name: Name,
  lines: z.array(SharedLineInput).max(30),
  done: z.boolean(),
});

export class SharedCartError extends Error {
  constructor(readonly code: "not_found" | "closed" | "host" | "full") {
    super(code);
  }
}

/**
 * The host starts sharing: a new link (the token is only shown once, to the host's phone).
 * The host is the first member (with their name and dishes), so everyone sees who picks what.
 */
export async function createSharedCart(db: DB, restaurantId: string, hostDeviceId: string, hostName: string, hostLines: z.infer<typeof SharedLineInput>[] = [], now = new Date()) {
  const token = randomToken(18);
  const name = hostName.trim().slice(0, 40);
  const [c] = await db
    .insert(sharedCarts)
    .values({
      restaurantId,
      tokenHash: sha256(token),
      hostDeviceHash: sha256(hostDeviceId),
      hostName: name,
      expiresAt: new Date(now.getTime() + SHARED_TTL_MS),
    })
    .returning({ id: sharedCarts.id });
  await db.insert(sharedCartMembers).values({ cartId: c!.id, deviceHash: sha256(hostDeviceId), name, lines: hostLines.slice(0, 30), done: false });
  return token;
}

async function find(db: DB, restaurantId: string, token: string, now = new Date()) {
  const [c] = await db
    .select()
    .from(sharedCarts)
    .where(and(eq(sharedCarts.restaurantId, restaurantId), eq(sharedCarts.tokenHash, sha256(token)), gt(sharedCarts.expiresAt, now)));
  return c ?? null;
}

/** What a phone sees: host or guest, everyone's dishes, who is done, and the order once sent. */
export async function viewSharedCart(db: DB, restaurantId: string, token: string, deviceId: string) {
  const c = await find(db, restaurantId, token);
  if (!c) return null;
  const me = sha256(deviceId);
  const [members, order] = await Promise.all([
    db.select().from(sharedCartMembers).where(eq(sharedCartMembers.cartId, c.id)).orderBy(asc(sharedCartMembers.createdAt)),
    c.orderId ? db.select({ code: orders.code, number: orders.number }).from(orders).where(eq(orders.id, c.orderId)).then((x) => x[0] ?? null) : Promise.resolve(null),
  ]);
  return {
    status: c.status,
    hostName: c.hostName,
    isHost: c.hostDeviceHash === me,
    expiresAt: c.expiresAt.toISOString(),
    order,
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      lines: m.lines,
      done: m.done,
      host: m.deviceHash === c.hostDeviceHash,
      mine: m.deviceHash === me,
      updatedAt: m.updatedAt.toISOString(),
    })),
  };
}

/**
 * A phone saves its part: dishes, name (required) and « j'ai terminé » (guests). The host saves
 * their dishes the same way so the guests see them; the host's name stays the cart's host name.
 */
export async function saveMember(db: DB, restaurantId: string, token: string, deviceId: string, input: z.infer<typeof MemberInput>, now = new Date()) {
  const c = await find(db, restaurantId, token, now);
  if (!c) throw new SharedCartError("not_found");
  if (c.status !== "open") throw new SharedCartError("closed");
  const me = sha256(deviceId);
  const isHost = c.hostDeviceHash === me;
  const existing = await db.select({ id: sharedCartMembers.id, deviceHash: sharedCartMembers.deviceHash }).from(sharedCartMembers).where(eq(sharedCartMembers.cartId, c.id));
  if (!existing.some((m) => m.deviceHash === me) && existing.length >= MAX_MEMBERS + 1) throw new SharedCartError("full");
  await db
    .insert(sharedCartMembers)
    .values({ cartId: c.id, deviceHash: me, name: input.name, lines: input.lines, done: isHost ? false : input.done })
    .onConflictDoUpdate({ target: [sharedCartMembers.cartId, sharedCartMembers.deviceHash], set: { name: input.name, lines: input.lines, done: isHost ? false : input.done, updatedAt: now } });
  if (isHost && input.name !== c.hostName) await db.update(sharedCarts).set({ hostName: input.name, updatedAt: now }).where(eq(sharedCarts.id, c.id));
}

/** The host ends the sharing: order sent (with its id), or simply stopped. */
export async function finishSharedCart(db: DB, restaurantId: string, token: string, deviceId: string, orderId: string | null, now = new Date()) {
  const c = await find(db, restaurantId, token, now);
  if (!c) throw new SharedCartError("not_found");
  if (c.hostDeviceHash !== sha256(deviceId)) throw new SharedCartError("host");
  // The order must be this business's and placed from the host's phone.
  let linked: string | null = null;
  if (orderId) {
    const [o] = await db.select({ id: orders.id, device: orders.customerDeviceId }).from(orders).where(and(eq(orders.restaurantId, restaurantId), eq(orders.id, orderId)));
    if (o && o.device === deviceId) linked = o.id;
  }
  await db
    .update(sharedCarts)
    .set({ status: linked ? "sent" : "closed", orderId: linked, updatedAt: now })
    .where(eq(sharedCarts.id, c.id));
}
