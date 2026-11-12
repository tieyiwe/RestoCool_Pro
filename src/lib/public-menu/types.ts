import type { I18nText } from "@/db/schema";

/** Everything the public menu needs, serialised once on the server (no secrets, no internal ids beyond item ids). */
export type PublicVariant = { id: string; name: I18nText; price: number };
export type PublicOption = { id: string; group: I18nText; name: I18nText; priceDelta: number };
export type PublicItem = {
  id: string;
  code: string | null;
  name: I18nText;
  description: I18nText | null;
  price: number | null;
  variants: PublicVariant[];
  options: PublicOption[];
  spicy: number;
  tags: string[];
  thumbUrl: string | null;
  photoUrl: string | null;
  soldOut: boolean;
  /** Owner's short note while sold out (« De retour demain »), shown under « Épuisé ». */
  soldOutNote: string | null;
  /** A running offer on this dish: its badge and, when the price changed, the usual price (struck through). */
  promo?: { id: string; badge: string | null; wasPrice: number | null };
};
export type PublicCategory = { id: string; name: I18nText; items: PublicItem[] };
export type PublicHours = { weekday: number; opens: string; closes: string };

export type PublicMenuData = {
  slug: string;
  name: string;
  description: I18nText | null;
  city: string;
  address: string | null;
  gmapsUrl: string | null;
  /** Exact business location, when the owner saved it (« Itinéraire » opens Google Maps navigation). */
  location: { lat: number; lng: number } | null;
  phones: string[];
  whatsapp: string | null;
  /** WhatsApp that receives takeaway orders. */
  takeawayWhatsapp: string | null;
  orangeMoney: string | null;
  moovMoney: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  theme: "lacquer" | "light" | "warm";
  accent: string;
  onAccent: string;
  /** Second brand colour and the text that reads on it. */
  accent2: string;
  onAccent2: string;
  poweredBadge: boolean;
  features: { welcomeScreen: boolean; fortuneCookie: boolean; share: boolean; takeawayWhatsapp: boolean; localBadge: boolean };
  locales: Array<"fr" | "en" | "zh">;
  hours: PublicHours[];
  categories: PublicCategory[];
  fortunes: I18nText[];
  preview: boolean;
  /** Running offers of the business (Business plan): « Offres du moment » and dish promotions. */
  promotions: PublicPromo[];
  /** Free plan only: one small RestoCool campaign shown near the bottom (« Sponsorisé »). */
  sponsor: PublicPromo | null;
};

export type PublicPromo = {
  id: string;
  placement: string;
  itemId: string | null;
  title: I18nText;
  body: I18nText | null;
  ctaLabel: I18nText | null;
  link: string | null;
  imageUrl: string | null;
  badge: string | null;
  promoPrice: number | null;
  theme: string;
  endsAt: string | null;
};

/** `note`: the customer's remark for the kitchen (« sans piment »). */
export type CartLine = { key: string; itemId: string; variantId: string | null; optionIds: string[]; qty: number; note?: string };
