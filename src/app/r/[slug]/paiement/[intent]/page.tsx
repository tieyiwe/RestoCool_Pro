import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { loadRestaurant } from "@/components/public-menu/render";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import zh from "@/messages/zh.json";
import { NOINDEX } from "@/lib/seo/site";
import { PaymentStatus } from "./payment-status";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Paiement", robots: NOINDEX };

/** Where a provider sends the customer back after an online payment (and where USSD payers wait). */
export default async function PaymentPage({ params }: { params: Promise<{ slug: string; intent: string }> }) {
  const { slug, intent } = await params;
  if (!z.uuid().safeParse(intent).success) notFound();
  const found = await loadRestaurant(slug);
  if (!found) notFound();
  const pick = (m: typeof fr.public) => Object.fromEntries(Object.entries(m).filter(([k]) => k.startsWith("pay")));
  return <PaymentStatus slug={slug} intentId={intent} name={found.restaurant.name} messages={{ fr: pick(fr.public), en: pick(en.public), zh: pick(zh.public) }} />;
}
