import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { KitchenDisplay } from "@/components/service/board";
import { ServicePlanGate } from "@/components/service/plan-gate";
import { servicePage } from "@/lib/orders/page";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("service"))("kitchen") };
}

/** Kitchen display (KDS): dishes to cook, by station. */
export default async function KitchenPage() {
  const { allowed, delays } = await servicePage("orders.read");
  if (!allowed) return <ServicePlanGate />;
  return <KitchenDisplay delays={delays} />;
}
