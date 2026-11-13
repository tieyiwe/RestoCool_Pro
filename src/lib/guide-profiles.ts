import type { Profile } from "@/components/guide/guide-scenes";
import { can, type Actor } from "@/lib/auth/can";

/**
 * Which guide profiles a member sees. The owner sees every profile (to train the team or show
 * a screen), managers their team's profiles, everyone else the profiles of what they can do.
 * The first one is where the guide opens.
 */
export function guideProfiles(actor: Actor, restaurantId: string): Profile[] {
  if (actor.kind === "member" && actor.role === "owner") return ["owner", "manager", "server", "host", "kitchen"];
  if (actor.kind === "member" && actor.role === "manager") return ["manager", "server", "host", "kitchen"];
  const r = { restaurantId };
  const out: Profile[] = [];
  if (can(actor, "orders.serve", r) || can(actor, "orders.confirm", r)) out.push("server");
  if (can(actor, "reservations.write", r)) out.push("host");
  if (can(actor, "orders.prepare", r)) out.push("kitchen");
  return out.length ? out : ["server"];
}
