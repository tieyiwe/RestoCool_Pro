import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ServicePlanGate } from "@/components/service/plan-gate";
import { TakeOrder } from "@/components/take-order/take-order";
import { servicePage } from "@/lib/orders/page";
import { loadPublicMenu } from "@/lib/public-menu/load";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("takeOrder"))("title") };
}

/** « Prendre une commande »: a server enters an order for a customer, from the staff menu. */
export default async function TakeOrderPage({ searchParams }: { searchParams: Promise<{ seat?: string }> }) {
  const { ctx, r, allowed } = await servicePage("orders.create");
  if (!allowed) return <ServicePlanGate />;
  const [menu, seatRows, sp] = await Promise.all([loadPublicMenu(getDb(), r, { preview: true }), ctx.repo.seating.seats(), searchParams]);
  const seats = seatRows.filter((s) => s.active && !s.busId).map((s) => ({ id: s.id, type: s.type, label: s.label }));
  return <TakeOrder categories={menu.categories} seats={seats} initialSeat={seats.some((s) => s.id === sp.seat) ? sp.seat! : null} />;
}
