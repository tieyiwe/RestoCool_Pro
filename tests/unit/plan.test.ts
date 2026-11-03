import { describe, expect, it } from "vitest";
import { PlanLimitError } from "@/lib/errors";
import { assertPlan, assertWithinLimit, effectiveStatus, hasFeature } from "@/lib/plan";

const now = new Date("2026-11-03T12:00:00Z");

describe("plans", () => {
  it("Gratuit has the menu but not ordering", () => {
    const r = { plan: "gratuit" as const, planStatus: "active" as const };
    expect(hasFeature(r, "menu", now)).toBe(true);
    expect(() => assertPlan(r, "ordering", now)).toThrow(PlanLimitError);
  });

  it("Pro has ordering and reservations but not multi-branch", () => {
    const r = { plan: "pro" as const, planStatus: "active" as const };
    expect(() => assertPlan(r, "ordering", now)).not.toThrow();
    expect(hasFeature(r, "reservations", now)).toBe(true);
    expect(hasFeature(r, "multiBranch", now)).toBe(false);
  });

  it("suspended keeps the menu visible but disables ordering", () => {
    const r = { plan: "business" as const, planStatus: "suspended" as const };
    expect(hasFeature(r, "menu", now)).toBe(true);
    expect(hasFeature(r, "ordering", now)).toBe(false);
  });

  it("past_due keeps working (grace period)", () => {
    expect(hasFeature({ plan: "pro", planStatus: "past_due" }, "ordering", now)).toBe(true);
  });

  it("an expired trial becomes past_due", () => {
    expect(effectiveStatus({ plan: "pro", planStatus: "trial", planExpiresAt: new Date("2026-11-01") }, now)).toBe("past_due");
    expect(effectiveStatus({ plan: "pro", planStatus: "trial", planExpiresAt: new Date("2026-12-01") }, now)).toBe("trial");
  });

  it("enforces the 40-item limit on Gratuit only", () => {
    expect(() => assertWithinLimit({ plan: "gratuit", planStatus: "active" }, "menuItems", 39)).not.toThrow();
    expect(() => assertWithinLimit({ plan: "gratuit", planStatus: "active" }, "menuItems", 40)).toThrow(PlanLimitError);
    expect(() => assertWithinLimit({ plan: "pro", planStatus: "active" }, "menuItems", 10_000)).not.toThrow();
    expect(() => assertWithinLimit({ plan: "pro", planStatus: "active" }, "staff", 10)).toThrow(PlanLimitError);
  });
});
