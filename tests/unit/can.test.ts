import { describe, expect, it } from "vitest";
import { can, type Action, type Actor } from "@/lib/auth/can";

const A = "rest-a";
const B = "rest-b";
const owner: Actor = { kind: "member", userId: "u1", restaurantId: A, role: "owner" };
const manager: Actor = { kind: "member", userId: "u2", restaurantId: A, role: "manager" };
const server: Actor = { kind: "staff", staffId: "s1", restaurantId: A, role: "server" };
const kitchen: Actor = { kind: "staff", staffId: "s2", restaurantId: A, role: "kitchen" };
const cashier: Actor = { kind: "staff", staffId: "s3", restaurantId: A, role: "cashier" };
const customer: Actor = { kind: "customer", deviceId: "d1", restaurantId: A };
const superadmin: Actor = { kind: "superadmin", userId: "sa", email: "sa@tiblogics.com" };

describe("can()", () => {
  it("denies when there is no actor", () => {
    expect(can(null, "menu.read", { restaurantId: A })).toBe(false);
  });

  it("never allows cross-tenant access, for any role or action", () => {
    const actions: Action[] = ["menu.read", "menu.write", "orders.read", "orders.pay", "settings.write", "restaurant.read"];
    for (const actor of [owner, manager, server, kitchen, cashier, customer]) {
      for (const action of actions) expect(can(actor, action, { restaurantId: B })).toBe(false);
    }
  });

  it("only managers and owners read the audit log (members with a staff role do not)", () => {
    for (const role of ["server", "kitchen", "cashier"] as const) {
      const member: Actor = { kind: "member", userId: `m-${role}`, restaurantId: A, role };
      expect(can(member, "audit.read", { restaurantId: A })).toBe(false);
    }
    expect(can(manager, "audit.read", { restaurantId: A })).toBe(true);
    expect(can(owner, "audit.read", { restaurantId: A })).toBe(true);
  });

  it("requires a resource for tenant-bound actors", () => {
    expect(can(owner, "menu.read")).toBe(false);
  });

  it("owner can do everything a manager can, plus settings, plan and managers", () => {
    for (const action of ["menu.write", "staff.write", "orders.discount", "settings.write", "plan.manage", "managers.write"] as Action[]) {
      expect(can(owner, action, { restaurantId: A })).toBe(true);
    }
    expect(can(manager, "menu.write", { restaurantId: A })).toBe(true);
    expect(can(manager, "settings.write", { restaurantId: A })).toBe(false);
    expect(can(manager, "plan.manage", { restaurantId: A })).toBe(false);
    expect(can(manager, "managers.write", { restaurantId: A })).toBe(false);
  });

  it("staff roles only get their service actions", () => {
    expect(can(server, "orders.confirm", { restaurantId: A })).toBe(true);
    expect(can(server, "orders.serve", { restaurantId: A })).toBe(true);
    expect(can(server, "menu.write", { restaurantId: A })).toBe(false);
    expect(can(server, "orders.discount", { restaurantId: A })).toBe(false);
    expect(can(kitchen, "orders.prepare", { restaurantId: A })).toBe(true);
    expect(can(kitchen, "orders.pay", { restaurantId: A })).toBe(false);
    expect(can(cashier, "orders.pay", { restaurantId: A })).toBe(true);
    expect(can(cashier, "orders.prepare", { restaurantId: A })).toBe(false);
  });

  it("customers can read the menu and create orders only", () => {
    expect(can(customer, "menu.read", { restaurantId: A })).toBe(true);
    expect(can(customer, "orders.create", { restaurantId: A })).toBe(true);
    expect(can(customer, "orders.read", { restaurantId: A })).toBe(false);
    expect(can(customer, "orders.pay", { restaurantId: A })).toBe(false);
  });

  it("super admin reads any restaurant but cannot change its menu or orders", () => {
    expect(can(superadmin, "orders.read", { restaurantId: B })).toBe(true);
    expect(can(superadmin, "platform.manage")).toBe(true);
    expect(can(superadmin, "menu.write", { restaurantId: B })).toBe(false);
    expect(can(superadmin, "orders.pay", { restaurantId: B })).toBe(false);
  });

  it("only super admins manage the platform", () => {
    expect(can(owner, "platform.manage", { restaurantId: A })).toBe(false);
  });
});
