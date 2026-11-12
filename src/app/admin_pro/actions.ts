"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { addNote, changePlan, recordPlanPayment, resolveErrors, setFeatured, setPublished, setSuspended, type AdminCtx } from "@/lib/admin/manage";
import { requireSuperadmin } from "@/lib/auth/context";
import { writeAudit } from "@/lib/audit";
import { NotFoundError } from "@/lib/errors";
import { Announcement, clearPlatformSetting, savePlatformSetting } from "@/lib/platform/settings";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const Id = z.uuid();

async function ctx(): Promise<AdminCtx> {
  return { db: getDb(), actor: await requireSuperadmin() };
}

/** Runs one admin change, then goes back to the page with ?ok= or ?error= (the page shows it). */
async function run(back: string, fn: () => Promise<string>) {
  let to: string;
  try {
    to = `${back}${back.includes("?") ? "&" : "?"}ok=${await fn()}`;
  } catch (err) {
    if (err instanceof z.ZodError) to = `${back}${back.includes("?") ? "&" : "?"}error=invalid`;
    else if (err instanceof NotFoundError) to = `${back}${back.includes("?") ? "&" : "?"}error=notFound`;
    else throw err;
  }
  revalidatePath("/admin_pro", "layout");
  redirect(to);
}

export async function changePlanAction(fd: FormData) {
  const id = Id.parse(s(fd, "id"));
  await run(`/admin_pro/businesses/${id}`, async () => {
    await changePlan(await ctx(), id, { plan: s(fd, "plan") as "pro", status: s(fd, "status") as "active", expiresOn: s(fd, "expiresOn"), reason: s(fd, "reason") || undefined });
    return "plan";
  });
}

export async function recordPaymentAction(fd: FormData) {
  const id = Id.parse(s(fd, "id"));
  await run(`/admin_pro/businesses/${id}`, async () => {
    await recordPlanPayment(await ctx(), id, { plan: s(fd, "plan") as "pro", months: s(fd, "months"), amount: s(fd, "amount").replace(/\s| /g, ""), method: s(fd, "method") as "cash", reference: s(fd, "reference") || undefined });
    return "payment";
  });
}

export async function suspendAction(fd: FormData) {
  const id = Id.parse(s(fd, "id"));
  const on = s(fd, "on") === "1";
  await run(`/admin_pro/businesses/${id}`, async () => {
    await setSuspended(await ctx(), id, on, s(fd, "reason") || undefined);
    return on ? "suspended" : "reactivated";
  });
}

export async function publishAction(fd: FormData) {
  const id = Id.parse(s(fd, "id"));
  const on = s(fd, "on") === "1";
  await run(`/admin_pro/businesses/${id}`, async () => {
    await setPublished(await ctx(), id, on);
    return on ? "published" : "unpublished";
  });
}

export async function featuredAction(fd: FormData) {
  const id = Id.parse(s(fd, "id"));
  const raw = s(fd, "rank");
  const back = s(fd, "back") === "settings" ? "/admin_pro/settings" : `/admin_pro/businesses/${id}`;
  await run(back, async () => {
    await setFeatured(await ctx(), id, raw ? z.coerce.number().int().min(1).max(3).parse(raw) : null);
    return "featured";
  });
}

export async function noteAction(fd: FormData) {
  const id = Id.parse(s(fd, "id"));
  await run(`/admin_pro/businesses/${id}#notes`, async () => {
    await addNote(await ctx(), id, s(fd, "body"));
    return "note";
  });
}

export async function resolveErrorAction(fd: FormData) {
  const raw = s(fd, "id");
  await run("/admin_pro/activity", async () => {
    await resolveErrors(await ctx(), raw === "all" ? "all" : Id.parse(raw));
    return "resolved";
  });
}

export async function freeLaunchAction(fd: FormData) {
  await run("/admin_pro/settings", async () => {
    const c = await ctx();
    const on = s(fd, "on") === "1";
    await savePlatformSetting(c.db, "freeLaunch", on, c.actor.email);
    await writeAudit(c.db, c.actor, { restaurantId: null, action: "admin.free_launch", entity: "platform", data: { on } });
    return "saved";
  });
}

export async function announcementAction(fd: FormData) {
  await run("/admin_pro/settings", async () => {
    const c = await ctx();
    if (s(fd, "clear") === "1") {
      await clearPlatformSetting(c.db, "announcement");
    } else {
      const value = Announcement.parse({
        active: s(fd, "active") === "on",
        level: s(fd, "level") || "info",
        text: { fr: s(fd, "fr"), en: s(fd, "en") || undefined, zh: s(fd, "zh") || undefined },
      });
      await savePlatformSetting(c.db, "announcement", value, c.actor.email);
    }
    await writeAudit(c.db, c.actor, { restaurantId: null, action: "admin.announcement", entity: "platform" });
    return "saved";
  });
}

/** Console language: English (default) or French, remembered on this device. */
export async function adminLangAction(fd: FormData) {
  const { cookies } = await import("next/headers");
  const { ADMIN_LANG_COOKIE } = await import("@/lib/admin/i18n");
  const lang = s(fd, "lang") === "fr" ? "fr" : "en";
  (await cookies()).set(ADMIN_LANG_COOKIE, lang, { path: "/admin_pro", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
  const back = s(fd, "back");
  redirect(back.startsWith("/admin_pro") ? back : "/admin_pro");
}
