import "server-only";
import { cache } from "react";
import { getMemberContext } from "./context";

/**
 * Where a signed-in person is in getting started:
 * - "none": no restaurant yet → everything except /app/new is locked
 * - "setup": owner of a restaurant whose setup wizard isn't finished → only the wizard
 * - "ready": the full app (menu, tables, service, personnel…)
 */
export const setupState = cache(async (): Promise<"none" | "setup" | "ready"> => {
  const ctx = await getMemberContext();
  if (!ctx) return "none";
  if (ctx.actor.role !== "owner") return "ready";
  const r = await ctx.repo.restaurant.get();
  return r && !r.settings.onboardedAt ? "setup" : "ready";
});
