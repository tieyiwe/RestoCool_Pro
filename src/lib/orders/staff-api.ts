import "server-only";
import { getDb } from "@/db";
import type { Action } from "@/lib/auth/can";
import { requireMember } from "@/lib/auth/context";
import { NotFoundError } from "@/lib/errors";
import { assertPlan } from "@/lib/plan";
import type { ServiceCtx } from "./service";

/** Signed-in member of a restaurant whose plan includes live service (Pro, Business, trial). */
export async function serviceCtx(action: Action): Promise<ServiceCtx> {
  const m = await requireMember(action);
  const r = await m.repo.restaurant.get();
  if (!r) throw new NotFoundError();
  assertPlan(r, "kitchenDisplay");
  return { db: getDb(), actor: m.actor, repo: m.repo };
}
