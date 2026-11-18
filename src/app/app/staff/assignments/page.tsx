import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AssignmentsEditor } from "@/components/my-tables/assignments";
import { ServicePlanGate } from "@/components/service/plan-gate";
import { getDb } from "@/db";
import { dayAssignments } from "@/lib/assignments";
import { can } from "@/lib/auth/can";
import { servicePage } from "@/lib/orders/page";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("assignments"))("title") };
}

/** « Affectations du jour »: who serves which tables today (managers edit, everyone on service reads). */
export default async function AssignmentsPage() {
  const { ctx, r, allowed } = await servicePage("orders.read");
  if (!allowed) return <ServicePlanGate />;
  const data = await dayAssignments({ db: getDb(), actor: ctx.actor, repo: ctx.repo });
  return <AssignmentsEditor data={data} canEdit={can(ctx.actor, "staff.write", { restaurantId: r.id })} />;
}
