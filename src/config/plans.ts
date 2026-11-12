/**
 * Single source of truth for plan limits and features.
 * Prices are integer FCFA per month, confirmed by the founder (Nov 2026): Pro 10 000 F, Business 25 000 F.
 */
export const PLAN_IDS = ["gratuit", "pro", "business"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const PLAN_STATUSES = ["trial", "active", "past_due", "suspended"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export type PlanFeature =
  | "menu"
  | "photos"
  | "qrPerSeat"
  | "ordering"
  | "staff"
  | "kitchenDisplay"
  | "reservations"
  | "reports"
  | "staffPerformance"
  | "multiBranch"
  | "hideBadge";

export type PlanLimits = {
  menuItems: number;
  staff: number;
  qrCodes: number;
};

export type PlanDefinition = {
  id: PlanId;
  priceMonthly: number;
  features: ReadonlySet<PlanFeature>;
  limits: PlanLimits;
};

const UNLIMITED = Number.POSITIVE_INFINITY;

export const PLANS: Record<PlanId, PlanDefinition> = {
  gratuit: {
    id: "gratuit",
    priceMonthly: 0,
    features: new Set<PlanFeature>(["menu", "photos"]),
    limits: { menuItems: 40, staff: 0, qrCodes: 1 },
  },
  pro: {
    id: "pro",
    priceMonthly: 10_000,
    features: new Set<PlanFeature>(["menu", "photos", "qrPerSeat", "ordering", "staff", "kitchenDisplay", "reservations", "reports"]),
    limits: { menuItems: UNLIMITED, staff: 10, qrCodes: UNLIMITED },
  },
  business: {
    id: "business",
    priceMonthly: 25_000,
    features: new Set<PlanFeature>([
      "menu",
      "photos",
      "qrPerSeat",
      "ordering",
      "staff",
      "kitchenDisplay",
      "reservations",
      "reports",
      "staffPerformance",
      "multiBranch",
      "hideBadge",
    ]),
    limits: { menuItems: UNLIMITED, staff: UNLIMITED, qrCodes: UNLIMITED },
  },
};

/** New restaurants get this plan for TRIAL_DAYS. */
export const TRIAL_PLAN: PlanId = "pro";
export const TRIAL_DAYS = 30;
/**
 * Launch offer: until online payment exists, every business keeps the Pro trial for free (it
 * never turns « en retard »). Set to false the day plans can be paid, then trials end normally.
 */
export const FREE_LAUNCH = true;
/** Days a past_due restaurant keeps working (with a banner) before suspension. */
export const GRACE_DAYS = 7;

/** Features that stay usable while suspended: the menu stays visible, ordering stops. */
export const SUSPENDED_ALLOWED: ReadonlySet<PlanFeature> = new Set<PlanFeature>(["menu", "photos"]);
