/**
 * Authorization rules. Pure function: the server calls this on every request.
 * The UI may call it too, but only to hide buttons; never rely on that.
 */
import { actionsFor, type AccessArea } from "./access";

export type StaffRole = "server" | "kitchen" | "cashier";
export type MemberRole = "owner" | "manager" | StaffRole;

export type Actor =
  /** `access`: the member's job role access (owner-editable); absent = the level's defaults. */
  | {
      kind: "member";
      /** Clerk user id, or `pin:<member id>` for a PIN session on an authorised device. */
      userId: string;
      restaurantId: string;
      role: MemberRole;
      access?: readonly AccessArea[];
      /** members.id of the person acting (for « confirmée par … »), when known. */
      memberId?: string;
      /** « pin »: logged in with their PIN on an authorised device (no personal account). */
      via?: "pin";
    }
  | { kind: "staff"; staffId: string; restaurantId: string; role: StaffRole }
  | { kind: "superadmin"; userId: string; email: string }
  | { kind: "customer"; deviceId: string; restaurantId: string };

export type Action =
  // reading
  | "restaurant.read"
  | "menu.read"
  | "orders.read"
  | "reports.read"
  | "audit.read"
  // menu & setup
  | "menu.write"
  | "seats.write"
  | "staff.write"
  | "devices.write"
  | "reservations.write"
  | "settings.write"
  | "plan.manage"
  | "managers.write"
  // service
  | "orders.create"
  | "orders.confirm"
  | "orders.prepare"
  | "orders.serve"
  | "orders.cancel"
  | "orders.pay"
  | "orders.discount"
  | "menu.soldOut"
  // platform
  | "platform.manage";

export type Resource = { restaurantId: string };

const SERVICE_READ: Action[] = ["restaurant.read", "menu.read", "orders.read"];

const ROLE_ACTIONS: Record<MemberRole, ReadonlySet<Action>> = {
  server: new Set<Action>([...SERVICE_READ, "orders.create", "orders.confirm", "orders.serve", "orders.pay", "menu.soldOut"]),
  kitchen: new Set<Action>([...SERVICE_READ, "orders.prepare", "menu.soldOut"]),
  cashier: new Set<Action>([...SERVICE_READ, "orders.pay"]),
  manager: new Set<Action>([
    ...SERVICE_READ,
    "reports.read",
    "audit.read",
    "menu.write",
    "seats.write",
    "staff.write",
    "devices.write",
    "reservations.write",
    "orders.create",
    "orders.confirm",
    "orders.prepare",
    "orders.serve",
    "orders.cancel",
    "orders.pay",
    "orders.discount",
    "menu.soldOut",
  ]),
  owner: new Set<Action>(),
};
// Owner = manager + restaurant-level controls.
ROLE_ACTIONS.owner = new Set<Action>([...ROLE_ACTIONS.manager, "settings.write", "plan.manage", "managers.write"]);

const CUSTOMER_ACTIONS: ReadonlySet<Action> = new Set<Action>(["restaurant.read", "menu.read", "orders.create"]);

/** Super admins read everything (read-only impersonation) and manage the platform. */
const SUPERADMIN_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  "restaurant.read",
  "menu.read",
  "orders.read",
  "reports.read",
  "audit.read",
  "plan.manage",
  "platform.manage",
]);

export function can(actor: Actor | null | undefined, action: Action, resource?: Resource): boolean {
  if (!actor) return false;
  if (actor.kind === "superadmin") return SUPERADMIN_ACTIONS.has(action);
  if (action === "platform.manage") return false;
  // Every non-platform actor is bound to exactly one restaurant.
  if (!resource || resource.restaurantId !== actor.restaurantId) return false;
  if (actor.kind === "customer") return CUSTOMER_ACTIONS.has(action);
  // The owner always keeps every right; job roles never apply to them.
  if (actor.kind === "member" && actor.role !== "owner" && actor.access) {
    // A job role may give up to everything a manager has, never the owner's controls.
    return ROLE_ACTIONS.manager.has(action) && actionsFor(actor.access).has(action);
  }
  return ROLE_ACTIONS[actor.role].has(action);
}

export function restaurantIdOf(actor: Actor): string | null {
  return actor.kind === "superadmin" ? null : actor.restaurantId;
}
