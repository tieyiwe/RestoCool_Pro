/**
 * Job roles and what they give access to. Pure (shared by the server and the UI).
 *
 * The owner picks, for each role, a set of « accès » (access areas) in plain words; each one
 * grants a few actions of `can()`. Roles come from a catalog (server, cook, cleaner…) that every
 * restaurant can edit, plus roles the owner types in.
 */
import type { Action, MemberRole } from "./can";

export const ACCESS_AREAS = ["service", "kitchen", "cashier", "cancel", "soldOut", "menu", "seats", "reservations", "staff", "reports"] as const;
export type AccessArea = (typeof ACCESS_AREAS)[number];

export const ROLE_GROUPS = ["management", "front", "kitchen", "bar", "support"] as const;
export type RoleGroup = (typeof ROLE_GROUPS)[number];

/** Everyone in the restaurant can open the app home and read the menu. */
export const BASE_ACTIONS: readonly Action[] = ["restaurant.read", "menu.read"];

export const AREA_ACTIONS: Record<AccessArea, readonly Action[]> = {
  service: ["orders.read", "orders.create", "orders.confirm", "orders.serve"],
  kitchen: ["orders.read", "orders.prepare"],
  cashier: ["orders.read", "orders.pay"],
  cancel: ["orders.read", "orders.cancel", "orders.discount"],
  soldOut: ["menu.soldOut"],
  menu: ["menu.write"],
  seats: ["seats.write"],
  reservations: ["reservations.write"],
  staff: ["staff.write", "devices.write"],
  reports: ["reports.read", "audit.read"],
};

/** Access of the built-in levels (members without a job role keep exactly what they had). */
export const LEVEL_ACCESS: Record<Exclude<MemberRole, "owner">, readonly AccessArea[]> = {
  manager: ACCESS_AREAS,
  server: ["service", "cashier", "soldOut"],
  kitchen: ["kitchen", "soldOut"],
  cashier: ["cashier"],
};

export function cleanAccess(list: readonly string[]): AccessArea[] {
  const set = new Set(list);
  return ACCESS_AREAS.filter((a) => set.has(a));
}

export function actionsFor(access: readonly AccessArea[]): Set<Action> {
  const out = new Set<Action>(BASE_ACTIONS);
  for (const a of access) for (const action of AREA_ACTIONS[a] ?? []) out.add(action);
  return out;
}

/**
 * The level stored on the member for a role: a role that manages the personnel is a « lead »
 * (only the owner may give it, change it or change those who hold it).
 */
export function levelFor(access: readonly AccessArea[]): Exclude<MemberRole, "owner"> {
  if (access.includes("staff")) return "manager";
  if (access.includes("service")) return "server";
  if (access.includes("kitchen")) return "kitchen";
  if (access.includes("cashier")) return "cashier";
  return "server";
}

export type CatalogRole = { key: string; group: RoleGroup; access: readonly AccessArea[] };

/** Ready-made roles every restaurant starts with (names are translated: `jobRoles.<key>`). */
export const ROLE_CATALOG: readonly CatalogRole[] = [
  { key: "manager", group: "management", access: ACCESS_AREAS },
  { key: "assistant_manager", group: "management", access: ["service", "kitchen", "cashier", "cancel", "soldOut", "menu", "seats", "reservations", "reports"] },
  { key: "server", group: "front", access: ["service", "cashier", "soldOut"] },
  { key: "host", group: "front", access: ["service", "reservations"] },
  { key: "cashier", group: "front", access: ["cashier"] },
  { key: "head_cook", group: "kitchen", access: ["kitchen", "soldOut", "menu"] },
  { key: "cook", group: "kitchen", access: ["kitchen", "soldOut"] },
  { key: "assistant_cook", group: "kitchen", access: ["kitchen"] },
  { key: "dishwasher", group: "kitchen", access: [] },
  { key: "bartender", group: "bar", access: ["kitchen", "soldOut", "service"] },
  { key: "cleaner", group: "support", access: [] },
  { key: "guard", group: "support", access: [] },
  { key: "rider", group: "support", access: [] },
];

/** The catalog role a member without a job role is moved to (legacy levels). */
export const LEVEL_TO_CATALOG: Record<Exclude<MemberRole, "owner">, string> = {
  manager: "manager",
  server: "server",
  kitchen: "cook",
  cashier: "cashier",
};
