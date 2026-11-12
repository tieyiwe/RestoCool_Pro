"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { requireMember } from "@/lib/auth/context";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { cancelDeletion, requestDeletion, restoreDeleted } from "@/lib/restaurants/deletion";
import { publicBaseUrl } from "@/lib/urls";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Ask to delete the business (owner, own account). */
export async function requestDeletionAction(fd: FormData) {
  const ctx = await requireMember("settings.write");
  let to = "/app/settings/danger?ok=requested";
  try {
    await requestDeletion(getDb(), ctx.actor, ctx.repo.restaurantId, { reason: s(fd, "reason"), confirmName: s(fd, "confirmName"), understood: s(fd, "understood") === "on" }, await publicBaseUrl());
  } catch (err) {
    if (err instanceof z.ZodError) to = `/app/settings/danger?error=${err.issues.some((i) => i.path[0] === "confirmName") ? "name" : err.issues.some((i) => i.path[0] === "understood") ? "understood" : "reason"}`;
    else if (err instanceof ForbiddenError) to = "/app/settings/danger?error=forbidden";
    else throw err;
  }
  revalidatePath("/app", "layout");
  redirect(to);
}

export async function cancelDeletionAction() {
  const ctx = await requireMember("settings.write");
  try {
    await cancelDeletion(getDb(), ctx.actor, ctx.repo.restaurantId);
  } catch (err) {
    if (!(err instanceof NotFoundError || err instanceof ForbiddenError)) throw err;
  }
  revalidatePath("/app", "layout");
  redirect("/app/settings/danger?ok=cancelled");
}

/** Restore a deleted business (from /app/new, where its owner lands). */
export async function restoreDeletedAction(fd: FormData) {
  const { getIdentity } = await import("@/lib/auth/context");
  const who = await getIdentity();
  if (!who) redirect("/sign-in");
  try {
    await restoreDeleted(getDb(), { kind: "member", userId: who.userId, restaurantId: "", role: "owner" }, z.uuid().parse(s(fd, "id")));
  } catch (err) {
    if (err instanceof ForbiddenError || err instanceof NotFoundError || err instanceof z.ZodError) redirect("/app/new?restore=failed");
    throw err;
  }
  redirect("/app?restored=1");
}
