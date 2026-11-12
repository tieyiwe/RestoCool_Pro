import type { Metadata, Viewport } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { loadMenuData, loadRestaurant, PublicMenu } from "@/components/public-menu/render";
import { getDb } from "@/db";
import { businessMeta, mainRc } from "@/lib/seo/business";
import { businessJsonLd } from "@/lib/seo/json-ld";
import { NOINDEX, OG_BASE, siteBase } from "@/lib/seo/site";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const found = await loadRestaurant((await params).slug);
  if (!found) return { title: "Menu", robots: NOINDEX };
  const r = found.restaurant;
  const { title, description } = await businessMeta(r);
  const url = `/r/${r.slug}`;
  return {
    title: { absolute: title },
    description,
    manifest: `/r/${r.slug}/manifest.webmanifest`,
    // An unpublished menu previewed by its owner is never indexed.
    robots: found.preview ? NOINDEX : { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
    alternates: found.preview ? undefined : { canonical: url },
    openGraph: { ...OG_BASE, title, description, url, type: "website" },
    twitter: { card: "summary_large_image", title, description },
    appleWebApp: { capable: true, title: r.name, statusBarStyle: "default" },
  };
}

export async function generateViewport({ params }: { params: Promise<{ slug: string }> }): Promise<Viewport> {
  const found = await loadRestaurant((await params).slug);
  return { themeColor: found?.restaurant.accentColor ?? "#0F6B3E", width: "device-width", initialScale: 1, viewportFit: "cover" };
}

export default async function PublicMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const found = await loadMenuData(slug);
  // Structured data (business, menu, prices) for search engines and AI assistants: published menus only.
  let jsonLd = null;
  if (found && !found.preview) {
    const r = found.restaurant;
    const [base, rc, meta, td] = await Promise.all([siteBase(), mainRc(getDb(), r.id), businessMeta(r), getTranslations({ locale: "fr", namespace: "directory" })]);
    jsonLd = businessJsonLd({ base, kind: r.kind, rc, menu: found.data, labels: { home: meta.labels.home, menu: meta.labels.menu, directory: td("title") } });
  }
  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <PublicMenu slug={slug} seatToken={null} />
    </>
  );
}
