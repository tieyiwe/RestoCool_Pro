import "server-only";
import { notFound, redirect } from "next/navigation";
import { getMemberContext, type MemberContext } from "./context";
import { can, type Action } from "./can";

/** For pages: signed-in member allowed to do `action`, else redirect/404 (never render data). */
export async function requireMemberPage(action: Action): Promise<MemberContext> {
  const ctx = await getMemberContext();
  if (!ctx) redirect("/app/new");
  if (!can(ctx.actor, action, { restaurantId: ctx.repo.restaurantId })) notFound();
  return ctx;
}
