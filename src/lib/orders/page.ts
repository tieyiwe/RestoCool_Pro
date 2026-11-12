import "server-only";
import { notFound } from "next/navigation";
import { can, type Action } from "@/lib/auth/can";
import { requireMemberPage } from "@/lib/auth/page";
import { hasFeature } from "@/lib/plan";

export const DEFAULT_DELAYS = { warnMin: 10, lateMin: 20 };

/** Staff service pages: member with the right, restaurant loaded, plan flag and timer delays. */
export async function servicePage(action: Action) {
  const ctx = await requireMemberPage(action);
  const r = await ctx.repo.restaurant.get();
  if (!r) notFound();
  const may = (a: Action) => can(ctx.actor, a, { restaurantId: r.id });
  const perms = { confirm: may("orders.confirm"), prepare: may("orders.prepare"), serve: may("orders.serve"), cancel: may("orders.cancel") };
  return { ctx, r, allowed: hasFeature(r, "kitchenDisplay"), delays: r.settings.serviceDelays ?? DEFAULT_DELAYS, perms };
}
