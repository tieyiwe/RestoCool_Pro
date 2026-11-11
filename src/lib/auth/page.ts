import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { DEVICE_COOKIE, STAFF_COOKIE } from "@/lib/devices";
import { getMemberContext, type MemberContext } from "./context";
import { can, type Action } from "./can";
import { setupState } from "./setup";

/**
 * For pages: signed-in member allowed to do `action`, else redirect/404 (never render data).
 * The business comes first: no restaurant → /app/new; setup not finished → the setup wizard.
 */
export async function requireMemberPage(action: Action, opts: { duringSetup?: boolean } = {}): Promise<MemberContext> {
  const ctx = await getMemberContext();
  if (!ctx) return redirectWithoutMember();
  if (!opts.duringSetup && (await setupState()) === "setup") redirect("/app/onboarding/1");
  if (!can(ctx.actor, action, { restaurantId: ctx.repo.restaurantId })) notFound();
  return ctx;
}

/**
 * Nobody to act as. On an authorised device (a PIN session ended: shift over, idle, locked) go
 * back to the PIN pad; otherwise the normal path (sign in, then create the business).
 */
export async function redirectWithoutMember(): Promise<never> {
  const jar = await cookies();
  if (jar.get(DEVICE_COOKIE)?.value || jar.get(STAFF_COOKIE)?.value) redirect("/poste?locked=1");
  redirect("/app/new");
}
