"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { restaurants } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { requireMember } from "@/lib/auth/context";
import { NotFoundError } from "@/lib/errors";
import { setReviewStatus } from "@/lib/reviews";

const Status = z.object({ id: z.uuid(), status: z.enum(["visible", "hidden", "deleted"]), filter: z.string().optional() });

/** Hide, show again or delete one review (owner / managers). */
export async function reviewStatusAction(fd: FormData) {
  const p = Status.parse({ id: fd.get("id"), status: fd.get("status"), filter: fd.get("filter") ?? undefined });
  const m = await requireMember("settings.write");
  let ok = p.status === "visible" ? "shown" : p.status;
  try {
    await setReviewStatus({ db: getDb(), actor: m.actor, restaurantId: m.repo.restaurantId }, p.id, p.status);
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
    ok = "";
  }
  revalidatePath("/app/reviews");
  const f = p.filter && p.filter !== "all" ? `&filter=${encodeURIComponent(p.filter)}` : "";
  redirect(ok ? `/app/reviews?ok=${ok}${f}` : `/app/reviews?error=notFound${f}`);
}

/** Reviews on or off for the whole business (the reviews already left are kept either way). */
export async function toggleReviewsAction(fd: FormData) {
  const on = fd.get("on") === "1";
  const m = await requireMember("settings.write");
  const r = await m.repo.restaurant.get();
  if (!r) throw new NotFoundError();
  const settings = { ...r.settings, features: { ...(r.settings.features ?? {}), reviews: on } };
  await getDb().update(restaurants).set({ settings, updatedAt: new Date() }).where(eq(restaurants.id, r.id));
  await writeAudit(getDb(), m.actor, { restaurantId: r.id, action: on ? "reviews.enabled" : "reviews.disabled", entity: "restaurant", entityId: r.id });
  revalidatePath("/app/reviews");
  revalidatePath(`/r/${r.slug}`);
  redirect(`/app/reviews?ok=${on ? "enabled" : "disabled"}`);
}
