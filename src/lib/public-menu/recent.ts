/** The last businesses opened on this phone (menus), to reopen in one tap. Device only. */
export type RecentPlace = { slug: string; name: string; city?: string | null; logo?: string | null; at: number };

const KEY = "rc-recent-places";
export const RECENT_MAX = 6;

export function readRecent(): RecentPlace[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? (v.filter((x) => x && typeof x.slug === "string" && typeof x.name === "string") as RecentPlace[]).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function rememberPlace(p: Omit<RecentPlace, "at">) {
  try {
    const list = [{ ...p, at: Date.now() }, ...readRecent().filter((x) => x.slug !== p.slug)].slice(0, RECENT_MAX);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* private mode: nothing kept */
  }
}

export function forgetPlace(slug: string): RecentPlace[] {
  const list = readRecent().filter((x) => x.slug !== slug);
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return list;
}
