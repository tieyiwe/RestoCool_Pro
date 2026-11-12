"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { requireMember } from "@/lib/auth/context";
import { ForbiddenError, NotFoundError, PlanLimitError } from "@/lib/errors";
import { assertPlan } from "@/lib/plan";
import { deletePromo, saveBusinessPromo, setPromoActive } from "@/lib/promotions";
import { notify } from "@/lib/realtime/events";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");

async function ctx() {
  const c = await requireMember("settings.write");
  const r = await c.repo.restaurant.get();
  if (!r) throw new NotFoundError();
  assertPlan(r, "promotions");
  return { ...c, r };
}

async function run(fn: () => Promise<string>, anchor = "") {
  let to = "/app/promotions";
  try {
    to += `?ok=${await fn()}${anchor}`;
  } catch (err) {
    if (err instanceof z.ZodError) to += "?error=invalid";
    else if (err instanceof PlanLimitError) to += "?error=plan";
    else if (err instanceof ForbiddenError) to += "?error=limit";
    else if (err instanceof NotFoundError) to += "?error=notFound";
    else throw err;
  }
  revalidatePath("/app/promotions");
  redirect(to);
}

/** Create or update an offer (the page shows it at once: customers' menus refresh live). */
export async function savePromoAction(fd: FormData) {
  await run(async () => {
    const c = await ctx();
    const id = s(fd, "id") ? z.uuid().parse(s(fd, "id")) : undefined;
    const db = getDb();
    const row = await saveBusinessPromo(
      db,
      c.actor,
      c.r.id,
      {
        placement: s(fd, "placement"),
        itemId: s(fd, "itemId"),
        title: { fr: s(fd, "titleFr"), en: s(fd, "titleEn"), zh: s(fd, "titleZh") },
        body: { fr: s(fd, "bodyFr"), en: s(fd, "bodyEn"), zh: s(fd, "bodyZh") },
        badge: s(fd, "badge"),
        promoPrice: s(fd, "promoPrice").replace(/\s| /g, ""),
        theme: s(fd, "theme") || "gold",
        imageUrl: s(fd, "imageUrl"),
        startsAt: s(fd, "startsAt"),
        endsAt: s(fd, "endsAt"),
        active: s(fd, "active") !== "0",
      },
      id,
    );
    await notify(db, { k: "menu", r: c.r.id });
    return id ? `saved#p-${row.id}` : `created#p-${row.id}`;
  });
}

export async function togglePromoAction(fd: FormData) {
  await run(async () => {
    const c = await ctx();
    const db = getDb();
    await setPromoActive(db, c.actor, z.uuid().parse(s(fd, "id")), s(fd, "on") === "1", c.r.id);
    await notify(db, { k: "menu", r: c.r.id });
    return s(fd, "on") === "1" ? "resumed" : "paused";
  });
}

export async function deletePromoAction(fd: FormData) {
  await run(async () => {
    const c = await ctx();
    const db = getDb();
    await deletePromo(db, c.actor, z.uuid().parse(s(fd, "id")), c.r.id);
    await notify(db, { k: "menu", r: c.r.id });
    return "deleted";
  });
}
