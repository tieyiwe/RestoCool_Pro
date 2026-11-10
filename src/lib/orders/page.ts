import "server-only";
import { notFound } from "next/navigation";
import type { Action } from "@/lib/auth/can";
import { requireMemberPage } from "@/lib/auth/page";
import { hasFeature } from "@/lib/plan";

export const DEFAULT_DELAYS = { warnMin: 10, lateMin: 20 };

/** Staff service pages: member with the right, restaurant loaded, plan flag and timer delays. */
export async function servicePage(action: Action) {
  const ctx = await requireMemberPage(action);
  const r = await ctx.repo.restaurant.get();
  if (!r) notFound();
  return { ctx, r, allowed: hasFeature(r, "kitchenDisplay"), delays: r.settings.serviceDelays ?? DEFAULT_DELAYS };
}
