import "server-only";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { cache } from "react";
import { getDb } from "@/db";
import { findRestaurantBySlug } from "@/db/repos/tenant";
import { getMemberContext } from "@/lib/auth/context";
import { whatsappHref } from "@/lib/format";
import { hasFeature } from "@/lib/plan";
import { loadPublicMenu } from "@/lib/public-menu/load";
import { DEFAULT_INACTIVITY } from "@/lib/seating/tables";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import zh from "@/messages/zh.json";
import { MenuApp } from "./menu-app";

/** Published restaurant, or an unpublished one previewed by its own member. */
export const loadRestaurant = cache(async (slug: string) => {
  const db = getDb();
  const published = await findRestaurantBySlug(db, slug);
  if (published) return { restaurant: published, preview: false };
  const draft = await findRestaurantBySlug(db, slug, { includeUnpublished: true });
  if (!draft) return null;
  const member = await getMemberContext();
  if (member?.memberships.some((m) => m.restaurantId === draft.id)) return { restaurant: draft, preview: true };
  return null;
});

export async function PublicMenu({ slug, seatToken, busToken = null }: { slug: string; seatToken: string | null; busToken?: string | null }) {
  const found = await loadRestaurant(slug);
  if (!found) notFound();
  const r = found.restaurant;
  const data = await loadPublicMenu(getDb(), r, { preview: found.preview });
  const wa = data.whatsapp ? whatsappHref(data.whatsapp) : null;
  const whatsappQr = wa ? await QRCode.toString(wa, { type: "svg", margin: 1, color: { dark: "#17231C", light: "#FFFFFF" } }) : null;
  // Only the public-menu strings, in the three languages (the visitor switches client-side).
  // On a bus, « serveur » becomes « hôtesse » (publicTransport overrides a few strings).
  const bus = r.kind === "transport";
  const messages = bus
    ? { fr: { ...fr.public, ...fr.publicTransport }, en: { ...en.public, ...en.publicTransport }, zh: { ...zh.public, ...zh.publicTransport } }
    : { fr: fr.public, en: en.public, zh: zh.public };
  // Seats exist to order: only on plans with ordering (Pro, Business, trial).
  const enabled = hasFeature(r, "ordering");
  const generic = (r.settings.qrStrategy ?? "per_seat") === "generic" || !hasFeature(r, "qrPerSeat");
  const modes = r.settings.seatingModes ?? ["table", "takeaway"];
  // A bus company: travelers always pick their seat on the bus map (or scan the seat-back QR).
  const transport = r.kind === "transport";
  const pickerAvailable = enabled && (transport || generic || modes.some((m) => m === "counter" || m === "takeaway" || m === "delivery"));
  return (
    <MenuApp
      data={data}
      messages={messages}
      whatsappQr={whatsappQr}
      seatToken={seatToken}
      seating={{ enabled, pickerAvailable, inactivity: r.settings.inactivity ?? DEFAULT_INACTIVITY, ...(transport ? { transport: { busToken } } : {}) }}
    />
  );
}
