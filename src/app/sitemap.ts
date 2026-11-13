import type { MetadataRoute } from "next";
import { getDb } from "@/db";
import { LEGAL } from "@/config/legal";
import { publishedBusinesses } from "@/lib/seo/business";
import { siteBase } from "@/lib/seo/site";

export const dynamic = "force-dynamic";

/**
 * sitemap.xml: the public pages and every published business menu (/r/{slug}). Never token links
 * (tables, buses), drafts or private pages. Without a database (build) it lists the static pages.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = await siteBase();
  const businesses = await publishedBusinesses(getDb()).catch(() => []);
  const newest = businesses.reduce<Date | undefined>((d, b) => (!d || b.updatedAt > d ? b.updatedAt : d), undefined);
  const legal = new Date(`${LEGAL.effectiveDate}T00:00:00Z`);
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/restaurants`, lastModified: newest, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/tarifs`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/guide`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/demo`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/c`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/privacy`, lastModified: legal, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/terms`, lastModified: legal, changeFrequency: "yearly", priority: 0.2 },
    ...businesses.map((b) => ({ url: `${base}/r/${b.slug}`, lastModified: b.updatedAt, changeFrequency: "daily" as const, priority: 0.8 })),
  ];
}
