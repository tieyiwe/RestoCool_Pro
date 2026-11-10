import { describe, expect, it } from "vitest";
import { ACCESS_AREAS, LEVEL_ACCESS, ROLE_CATALOG, actionsFor, levelFor } from "@/lib/auth/access";
import { can, type Actor } from "@/lib/auth/can";

const R = { restaurantId: "r1" };
const member = (role: "owner" | "manager" | "server" | "kitchen" | "cashier", access?: readonly (typeof ACCESS_AREAS)[number][]): Actor => ({ kind: "member", userId: "u", restaurantId: "r1", role, ...(access ? { access } : {}) });

describe("job roles and access", () => {
  it("built-in levels keep exactly their previous rights", () => {
    for (const level of ["manager", "server", "kitchen", "cashier"] as const) {
      const withAccess = member(level, LEVEL_ACCESS[level]);
      for (const action of ["orders.read", "orders.create", "orders.confirm", "orders.prepare", "orders.serve", "orders.cancel", "orders.pay", "orders.discount", "menu.soldOut", "menu.write", "seats.write", "staff.write", "reports.read"] as const) {
        expect(can(withAccess, action, R), `${level} ${action}`).toBe(can(member(level), action, R));
      }
    }
  });
  it("a role opens only what is ticked, never the owner's controls", () => {
    const dishwasher = member("server", []);
    expect(can(dishwasher, "restaurant.read", R)).toBe(true);
    expect(can(dishwasher, "orders.read", R)).toBe(false);
    const all = member("manager", ACCESS_AREAS);
    for (const a of ["settings.write", "plan.manage", "managers.write", "platform.manage"] as const) expect(can(all, a, R)).toBe(false);
    expect(can(member("server", ["menu"]), "menu.write", R)).toBe(true);
    expect(can(member("server", ["menu"]), "menu.write", { restaurantId: "other" })).toBe(false);
  });
  it("the owner is never limited by a role", () => {
    expect(can(member("owner", []), "settings.write", R)).toBe(true);
    expect(can(member("owner", []), "orders.pay", R)).toBe(true);
  });
  it("roles that manage the personnel are « leads »", () => {
    expect(levelFor(["staff"])).toBe("manager");
    expect(levelFor(["kitchen"])).toBe("kitchen");
    expect(levelFor([])).toBe("server");
    expect([...actionsFor(["kitchen"])]).toContain("orders.prepare");
    expect(ROLE_CATALOG.map((r) => r.key)).toEqual(expect.arrayContaining(["manager", "assistant_manager", "server", "cook", "assistant_cook", "cleaner", "bartender"]));
  });
});
