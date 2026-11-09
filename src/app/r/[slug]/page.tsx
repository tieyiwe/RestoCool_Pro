import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { cache } from "react";
import { MenuApp } from "@/components/public-menu/menu-app";
import { getDb } from "@/db";
import { findRestaurantBySlug } from "@/db/repos/tenant";
import { getMemberContext } from "@/lib/auth/context";
import { whatsappHref } from "@/lib/format";
import { loadPublicMenu } from "@/lib/public-menu/load";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import zh from "@/messages/zh.json";

export const dynamic = "force-dynamic";

const loadRestaurant = cache(async (slug: string) => {
  const db = getDb();
  const published = await findRestaurantBySlug(db, slug);
  if (published) return { restaurant: published, preview: false };
  // Owners/managers can preview their own unpublished menu.
  const draft = await findRestaurantBySlug(db, slug, { includeUnpublished: true });
  if (!draft) return null;
  const member = await getMemberContext();
  if (member?.memberships.some((m) => m.restaurantId === draft.id)) return { restaurant: draft, preview: true };
  return null;
});

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
  const found = await loadRestaurant((await params).slug);
  if (!found) notFound();
  const data = await loadPublicMenu(getDb(), found.restaurant, { preview: found.preview });
  const wa = data.whatsapp ? whatsappHref(data.whatsapp) : null;
  const whatsappQr = wa ? await QRCode.toString(wa, { type: "svg", margin: 1, color: { dark: "#17231C", light: "#FFFFFF" } }) : null;
  // Only the public-menu strings, in the three languages (the visitor switches client-side).
  const messages = { fr: fr.public, en: en.public, zh: zh.public };
  return <MenuApp data={data} messages={messages} whatsappQr={whatsappQr} />;
}
