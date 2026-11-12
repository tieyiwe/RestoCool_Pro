import "server-only";
import { inArray, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { restaurants } from "@/db/schema";
import { RESERVED_SLUGS, slugify } from "@/lib/slug";

export type NameCheck = {
  slug: string;
  available: boolean;
  /** 1 to 3 free names close to what was typed (only when the name is taken). */
  suggestions: Array<{ name: string; slug: string }>;
};

/** Names close to the one typed: with the town, « Chez … », the kind of place, a district. */
function candidates(name: string, city: string | null, kind: "restaurant" | "transport"): string[] {
  const n = name.trim().replace(/\s+/g, " ");
  const town = (city ?? "").trim();
  const short = /^ouagadougou$/i.test(town) ? "Ouaga" : /^bobo-dioulasso$/i.test(town) ? "Bobo" : town;
  const hasPrefix = /^(chez|le|la|les|l['’]|restaurant|maquis|bar|café|cafe|hôtel|hotel)\b/i.test(n);
  const list =
    kind === "transport"
      ? [`${n} ${short}`, `${n} Voyages`, `${n} Transport`, `${n} Express`, `${n} VIP`]
      : [`${n} ${short}`, ...(hasPrefix ? [] : [`Chez ${n}`, `Maquis ${n}`]), `${n} ${short} Centre`, `${n} 2`];
  return [...new Set(list.map((x) => x.trim()).filter((x) => x.length >= 2 && x.length <= 80 && slugify(x) !== slugify(n)))];
}

async function takenSlugs(db: DB, slugs: string[]): Promise<Set<string>> {
  if (!slugs.length) return new Set();
  const rows = await db.select({ slug: restaurants.slug }).from(restaurants).where(inArray(restaurants.slug, slugs));
  return new Set(rows.map((r) => r.slug));
}

/**
 * Is this business name free? A name is taken when its web address (/r/<slug>) is used, or when
 * another business already has the same name (ignoring case and accents). If it is taken, up to
 * three free names close to it are suggested.
 */
export async function checkBusinessName(db: DB, raw: string, opts: { city?: string | null; kind?: "restaurant" | "transport" } = {}): Promise<NameCheck> {
  const name = raw.trim();
  const slug = slugify(name);
  const [bySlug, byName] = await Promise.all([
    takenSlugs(db, [slug]),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(restaurants)
      .where(sql`lower(${restaurants.name}) = lower(${name})`),
  ]);
  const available = !RESERVED_SLUGS.has(slug) && !bySlug.has(slug) && (byName[0]?.n ?? 0) === 0;
  if (available) return { slug, available, suggestions: [] };
  const options = candidates(name, opts.city ?? null, opts.kind ?? "restaurant").map((n) => ({ name: n, slug: slugify(n) }));
  const used = await takenSlugs(db, options.map((o) => o.slug));
  const suggestions = options.filter((o) => !used.has(o.slug) && !RESERVED_SLUGS.has(o.slug)).slice(0, 3);
  return { slug, available, suggestions };
}
