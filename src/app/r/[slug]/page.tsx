import type { Metadata, Viewport } from "next";
import { loadRestaurant, PublicMenu } from "@/components/public-menu/render";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const found = await loadRestaurant((await params).slug);
  if (!found) return { title: "Menu" };
  const r = found.restaurant;
  return {
    title: { absolute: `${r.name} · Menu` },
    description: r.description?.fr ?? `${r.name}, ${r.city}`,
    manifest: `/r/${r.slug}/manifest.webmanifest`,
    robots: found.preview ? { index: false, follow: false } : undefined,
    appleWebApp: { capable: true, title: r.name, statusBarStyle: "default" },
  };
}

export async function generateViewport({ params }: { params: Promise<{ slug: string }> }): Promise<Viewport> {
  const found = await loadRestaurant((await params).slug);
  return { themeColor: found?.restaurant.accentColor ?? "#0F6B3E", width: "device-width", initialScale: 1, viewportFit: "cover" };
}

export default async function PublicMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  return <PublicMenu slug={(await params).slug} seatToken={null} />;
}
