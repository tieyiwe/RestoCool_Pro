import { PLANS, SUSPENDED_ALLOWED, type PlanFeature, type PlanId, type PlanLimits, type PlanStatus } from "@/config/plans";
import { PlanLimitError } from "./errors";

export type PlanSubject = {
  plan: PlanId;
  planStatus: PlanStatus;
  planExpiresAt?: Date | null;
};

/** The status that actually applies right now (an expired trial counts as past_due). */
export function effectiveStatus(r: PlanSubject, now: Date = new Date()): PlanStatus {
  if (r.planStatus === "trial" && r.planExpiresAt && r.planExpiresAt.getTime() < now.getTime()) return "past_due";
  return r.planStatus;
}

export function hasFeature(r: PlanSubject, feature: PlanFeature, now: Date = new Date()): boolean {
  if (effectiveStatus(r, now) === "suspended" && !SUSPENDED_ALLOWED.has(feature)) return false;
  return PLANS[r.plan].features.has(feature);
}

/** Throws PlanLimitError when the restaurant's plan does not include `feature`. */
export function assertPlan(r: PlanSubject, feature: PlanFeature, now: Date = new Date()): void {
  if (!hasFeature(r, feature, now)) throw new PlanLimitError(feature);
}

/** Throws PlanLimitError when adding one more would exceed the limit. */
export function assertWithinLimit(r: PlanSubject, limit: keyof PlanLimits, currentCount: number): void {
  if (currentCount + 1 > PLANS[r.plan].limits[limit]) throw new PlanLimitError(limit);
}
