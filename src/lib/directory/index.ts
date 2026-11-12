import "server-only";
import { and, asc, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { accessCodes, restaurants } from "@/db/schema";
import { formatRc, normalizeCode } from "@/lib/access-codes";

export type DirectoryEntry = {
  slug: string;
  name: string;
  city: string;
  logoUrl: string | null;
  accent: string;
  description: { fr: string } & Partial<Record<string, string>>;
  rc: string | null;
};

const columns = {
  id: restaurants.id,
  slug: restaurants.slug,
  name: restaurants.name,
  city: restaurants.city,
  logoUrl: restaurants.logoUrl,
  accent: restaurants.accentColor,
  description: restaurants.description,
  rc: accessCodes.code,
};

type Row = { slug: string; name: string; city: string | null; logoUrl: string | null; accent: string; description: unknown; rc: string | null };
const toEntry = (r: Row): DirectoryEntry => ({
  slug: r.slug,
  name: r.name,
  city: r.city ?? "",
  logoUrl: r.logoUrl,
  accent: r.accent,
  description: (r.description as DirectoryEntry["description"] | null) ?? { fr: "" },
  rc: r.rc ? formatRc(r.rc) : null,
});

const FROM = "ÀÁÂÄÃÉÈÊËÍÌÎÏÓÒÔÖÕÚÙÛÜÇàáâäãéèêëíìîïóòôöõúùûüçŒœ’";
const TO = "AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuucOo'";
/** lower() + accents removed, without any Postgres extension (works on Replit's database). */
const fold = (x: ReturnType<typeof sql>) => sql`lower(translate(${x}, ${FROM}, ${TO}))`;
const foldText = (s: string) => {
  let out = "";
  for (const ch of s) {
    const i = FROM.indexOf(ch);
    out += i >= 0 ? TO[i] : ch;
  }
  return out.toLowerCase();
};

/** Published restaurants only, with their main « numéro RC » (printed on their stickers anyway). */
function base(db: DB) {
  return db
    .select(columns)
    .from(restaurants)
    .leftJoin(accessCodes, and(eq(accessCodes.restaurantId, restaurants.id), sql`${accessCodes.seatId} is null`));
}

/** Featured on restocool.com (1 to 3, chosen by the platform admin). */
export async function featuredRestaurants(db: DB, limit = 3): Promise<DirectoryEntry[]> {
  const rows = await base(db)
    .where(and(eq(restaurants.published, true), isNotNull(restaurants.featuredRank)))
    .orderBy(asc(restaurants.featuredRank))
    .limit(limit);
  return rows.map(toEntry);
}

/**
 * Directory search: by name or city (contains, accents ignored), or by numéro RC (any code of the
 * restaurant: main or table). Empty query → most recently updated restaurants.
 */
export async function searchRestaurants(db: DB, raw: string, limit = 24): Promise<DirectoryEntry[]> {
  const q = raw.trim().slice(0, 60);
  if (!q) {
    const rows = await base(db).where(eq(restaurants.published, true)).orderBy(asc(restaurants.featuredRank), desc(restaurants.updatedAt)).limit(limit);
    return rows.map(toEntry);
  }
  const code = normalizeCode(q);
  if (code) {
    const [hit] = await db.select({ restaurantId: accessCodes.restaurantId }).from(accessCodes).where(eq(accessCodes.code, code)).limit(1);
    if (hit) {
      const rows = await base(db).where(and(eq(restaurants.published, true), eq(restaurants.id, hit.restaurantId))).limit(1);
      if (rows.length) return rows.map(toEntry);
    }
  }
  const like = `%${foldText(q).replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  // Typing the start of a numéro RC (« RC-K7 ») narrows the list too.
  const rcStart = /^rc[-\s#]?([a-z0-9]{1,4})$/i.exec(q)?.[1]?.toUpperCase();
  const rows = await base(db)
    .where(
      and(
        eq(restaurants.published, true),
        or(
          sql`${fold(sql`${restaurants.name}`)} like ${like}`,
          sql`${fold(sql`coalesce(${restaurants.city}, '')`)} like ${like}`,
          ...(rcStart ? [ilike(accessCodes.code, `${rcStart}%`)] : []),
        ),
      ),
    )
    .orderBy(asc(restaurants.featuredRank), asc(restaurants.name))
    .limit(limit);
  return rows.map(toEntry);
}

/**
 * « RC number » typeahead: businesses whose main numéro RC starts with what was typed so far
 * (« K », « K7 », « RC-K7M »…). Published only; at most a few.
 */
export async function suggestByRc(db: DB, raw: string, limit = 5): Promise<DirectoryEntry[]> {
  let s = raw.toUpperCase().replace(/[\s\-_.#]/g, "");
  if (s.startsWith("RC")) s = s.slice(2);
  if (!s || s.length > 5 || !/^[ABCDEFGHJKMNPQRSTWXYZ23456789]+$/.test(s)) return [];
  const rows = await base(db)
    .where(and(eq(restaurants.published, true), ilike(accessCodes.code, `${s}%`)))
    .orderBy(asc(accessCodes.code))
    .limit(limit);
  return rows.map(toEntry);
}
