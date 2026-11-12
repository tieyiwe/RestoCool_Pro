import "server-only";
import type { DB } from "@/db";
import type { HomePromoData } from "@/components/promo/home-promo";
import { platformPromos } from ".";

/** The live campaign for a home-page spot, in the visitor's language (French when missing). */
export async function homePromo(db: DB, placement: "home_hero" | "home_strip", locale: string): Promise<HomePromoData | null> {
  const [p] = await platformPromos(db, placement).catch(() => []);
  if (!p) return null;
  const pick = (x: Record<string, string | undefined> | null | undefined) => (x ? x[locale] || x.fr || null : null);
  return { id: p.id, title: pick(p.title) ?? "", body: pick(p.body), cta: pick(p.ctaLabel), link: p.link, badge: p.badge, imageUrl: p.imageUrl, theme: p.theme };
}
