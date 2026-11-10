import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getDb } from "@/db";
import { OrderDetail } from "@/components/service/board";
import { ServicePlanGate } from "@/components/service/plan-gate";
import { NotFoundError } from "@/lib/errors";
import { servicePage } from "@/lib/orders/page";
import { staffOrder } from "@/lib/orders/serialize";
import { personLookup, personnel } from "@/lib/personnel";
import { getOrder } from "@/lib/orders/service";

export const dynamic = "force-dynamic";

/** Opened by scanning the QR on the customer's « Montrer au serveur » screen. */
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const { ctx, allowed, delays } = await servicePage("orders.read");
  if (!allowed) return <ServicePlanGate />;
  const t = await getTranslations("service");
  // Only orders of the member's current restaurant: anything else is « introuvable ».
  const order = await getOrder({ db: getDb(), actor: ctx.actor, repo: ctx.repo }, id.data).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  return (
    <div className="flex flex-col gap-4">
      <Link href="/app/service" className="min-h-11 self-start rounded-lg border border-border px-4 py-2.5 font-semibold">
        ← {t("frontDesk")}
      </Link>
      <OrderDetail initial={staffOrder(order, undefined, personLookup(await personnel(getDb(), ctx.repo.restaurantId)))} delays={delays} />
    </div>
  );
}
