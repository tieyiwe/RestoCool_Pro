import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadRestaurant, PublicMenu } from "@/components/public-menu/render";

export const dynamic = "force-dynamic";

/** Printed table QR: same menu, with the seat set from the token (checked by the server on join). */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const found = await loadRestaurant((await params).slug);
  return {
    title: found ? { absolute: `${found.restaurant.name} · Menu` } : "Menu",
    manifest: found ? `/r/${found.restaurant.slug}/manifest.webmanifest` : undefined,
    // Table links must never be indexed or shared by search engines.
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function SeatMenuPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) notFound();
  return <PublicMenu slug={slug} seatToken={token} />;
}
