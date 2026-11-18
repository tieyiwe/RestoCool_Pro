import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MyTables } from "@/components/my-tables/my-tables";
import { ServicePlanGate } from "@/components/service/plan-gate";
import { getDb } from "@/db";
import { can } from "@/lib/auth/can";
import { servicePage } from "@/lib/orders/page";
import { myTables } from "@/lib/service/my-tables";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("myTables"))("title") };
}

/** « Mes tables »: the server's own tables, orders to confirm and serve, bills asked for. */
export default async function MyTablesPage() {
  const { ctx, r, allowed, perms } = await servicePage("orders.read");
  if (!allowed) return <ServicePlanGate />;
  const data = await myTables({ db: getDb(), actor: ctx.actor, repo: ctx.repo });
  const take = can(ctx.actor, "orders.create", { restaurantId: r.id });
  return <MyTables initial={data} perms={{ take, confirm: perms.confirm, serve: perms.serve, pay: perms.pay }} />;
}
