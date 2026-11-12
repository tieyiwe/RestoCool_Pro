import { getDb } from "@/db";
import { publishedBusinesses } from "@/lib/seo/business";
import { llmsTxt } from "@/lib/seo/llms";
import { siteBase } from "@/lib/seo/site";

export const dynamic = "force-dynamic";

/** https://llmstxt.org: a short Markdown map of RestoCool for AI assistants. */
export async function GET() {
  const base = await siteBase();
  const businesses = await publishedBusinesses(getDb(), 500).catch(() => []);
  return new Response(llmsTxt(base, businesses), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}
