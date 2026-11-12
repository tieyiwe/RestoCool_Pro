import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FrontDesk, OrderPermsProvider } from "@/components/service/board";
import { ServicePlanGate } from "@/components/service/plan-gate";
import { servicePage } from "@/lib/orders/page";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("service"))("frontDesk") };
}

/** Front desk: live board of every open order (tablet first). */
export default async function ServicePage() {
  const { allowed, delays, perms } = await servicePage("orders.read");
  if (!allowed) return <ServicePlanGate />;
  return (
    <OrderPermsProvider perms={perms}>
      <FrontDesk delays={delays} />
    </OrderPermsProvider>
  );
}
