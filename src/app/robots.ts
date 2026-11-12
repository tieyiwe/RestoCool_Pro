import type { MetadataRoute } from "next";
import { ALLOW, DISALLOW, KNOWN_CRAWLERS } from "@/lib/seo/robots-rules";
import { siteBase } from "@/lib/seo/site";

export const dynamic = "force-dynamic";

/** robots.txt: public pages open to every crawler (AI assistants included), private areas closed. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await siteBase();
  const rule = { allow: [...ALLOW], disallow: [...DISALLOW] };
  return {
    rules: [
      { userAgent: "*", ...rule },
      { userAgent: [...KNOWN_CRAWLERS], ...rule },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
