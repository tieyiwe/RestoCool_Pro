import "server-only";
import { randomInt } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "@/db";
import { accessCodes, restaurants, seats } from "@/db/schema";

/**
 * 5-character codes printed under every QR, for customers who can't or don't want to scan.
 * The alphabet leaves out look-alikes (0/O, 1/I/L, U/V) so codes can be read aloud and typed
 * on any phone: 29^5 ≈ 20 million codes. The code lookup is rate limited (see /c).
 */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTWXYZ23456789";
export const CODE_LENGTH = 5;
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function generateCode(): string {
  let s = "";
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

/** Uppercases and drops spaces, dashes and dots. Null if it can't be a code. */
export function normalizeCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s\-_.]/g, "");
  return CODE_RE.test(s) ? s : null;
}

/** Inserts a fresh random code for (restaurant, seat|null), retrying on the rare collision. */
async function insertCode(db: DB, restaurantId: string, seatId: string | null): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateCode();
    const rows = await db.insert(accessCodes).values({ code, restaurantId, seatId }).onConflictDoNothing().returning({ code: accessCodes.code });
    if (rows[0]) return rows[0].code;
    // Lost a race for this restaurant/seat (unique index) rather than a code collision?
    const existing = await db.query.accessCodes.findFirst({
      where: and(eq(accessCodes.restaurantId, restaurantId), seatId ? eq(accessCodes.seatId, seatId) : isNull(accessCodes.seatId)),
    });
    if (existing) return existing.code;
  }
  throw new Error("Could not allocate an access code");
}

/** The restaurant's main code (its generic QR). Created on first use. */
export async function ensureMainCode(db: DB, restaurantId: string): Promise<string> {
  const existing = await db.query.accessCodes.findFirst({ where: and(eq(accessCodes.restaurantId, restaurantId), isNull(accessCodes.seatId)) });
  return existing?.code ?? insertCode(db, restaurantId, null);
}

/** Codes for these seats of the restaurant (seat id → code), creating the missing ones. */
export async function ensureSeatCodes(db: DB, restaurantId: string, seatIds: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (seatIds.length === 0) return out;
  const rows = await db
    .select({ code: accessCodes.code, seatId: accessCodes.seatId })
    .from(accessCodes)
    .where(and(eq(accessCodes.restaurantId, restaurantId), inArray(accessCodes.seatId, [...seatIds])));
  for (const r of rows) if (r.seatId) out.set(r.seatId, r.code);
  for (const id of seatIds) if (!out.has(id)) out.set(id, await insertCode(db, restaurantId, id));
  return out;
}

/**
 * Where a code leads: the restaurant menu, or the seat's menu (same page as scanning its QR).
 * An inactive seat falls back to the restaurant menu, so an old sticker still opens the menu.
 */
export async function resolveCode(db: DB, raw: string): Promise<{ slug: string; seatToken: string | null } | null> {
  const code = normalizeCode(raw);
  if (!code) return null;
  const [row] = await db
    .select({ slug: restaurants.slug, seatToken: seats.qrToken, seatActive: seats.active, seatRestaurant: seats.restaurantId, restaurantId: accessCodes.restaurantId })
    .from(accessCodes)
    .innerJoin(restaurants, eq(restaurants.id, accessCodes.restaurantId))
    .leftJoin(seats, eq(seats.id, accessCodes.seatId))
    .where(eq(accessCodes.code, code))
    .limit(1);
  if (!row) return null;
  const seatOk = row.seatToken && row.seatActive && row.seatRestaurant === row.restaurantId;
  return { slug: row.slug, seatToken: seatOk ? row.seatToken : null };
}
