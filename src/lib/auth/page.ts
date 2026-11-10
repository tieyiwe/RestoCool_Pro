import "server-only";
import { notFound, redirect } from "next/navigation";
import { getMemberContext, type MemberContext } from "./context";
import { can, type Action } from "./can";
import { setupState } from "./setup";

/**
 * For pages: signed-in member allowed to do `action`, else redirect/404 (never render data).
 * The business comes first: no restaurant → /app/new; setup not finished → the setup wizard.
 */
export async function requireMemberPage(action: Action, opts: { duringSetup?: boolean } = {}): Promise<MemberContext> {
  const ctx = await getMemberContext();
  if (!ctx) redirect("/app/new");
  if (!opts.duringSetup && (await setupState()) === "setup") redirect("/app/onboarding/1");
  if (!can(ctx.actor, action, { restaurantId: ctx.repo.restaurantId })) notFound();
  return ctx;
}
