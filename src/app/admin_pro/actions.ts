"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { addNote, changePlan, recordPlanPayment, resolveErrors, setFeatured, setPublished, setSuspended, type AdminCtx } from "@/lib/admin/manage";
import { requireSuperadmin } from "@/lib/auth/context";
import { writeAudit } from "@/lib/audit";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { PERM_PRESETS, type AdminPerm } from "@/lib/admin/access";
import { STATUSES, adminReply } from "@/lib/support/requests";
import { deleteMessage, emailPlatformMessage, sendPlatformMessage } from "@/lib/platform/messages";
import { publicBaseUrl } from "@/lib/urls";
import { after } from "next/server";
import { addCollaborator, removeCollaborator, updateCollaborator } from "@/lib/admin/team";
import { Announcement, clearPlatformSetting, savePlatformSetting } from "@/lib/platform/settings";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const Id = z.uuid();

async function ctx(perm: AdminPerm): Promise<AdminCtx> {
  return { db: getDb(), actor: await requireSuperadmin(perm) };
}

/** Runs one admin change, then goes back to the page with ?ok= or ?error= (the page shows it). */
async function run(back: string, fn: () => Promise<string>) {
  let to: string;
  try {
    to = `${back}${back.includes("?") ? "&" : "?"}ok=${await fn()}`;
  } catch (err) {
    if (err instanceof z.ZodError) to = `${back}${back.includes("?") ? "&" : "?"}error=invalid`;
    else if (err instanceof NotFoundError) to = `${back}${back.includes("?") ? "&" : "?"}error=notFound`;
    else if (err instanceof ForbiddenError) to = `${back}${back.includes("?") ? "&" : "?"}error=forbidden`;
    else throw err;
  }
  revalidatePath("/admin_pro", "layout");
  redirect(to);
}

export async function changePlanAction(fd: FormData) {
  const id = Id.parse(s(fd, "id"));
  await run(`/admin_pro/businesses/${id}`, async () => {
    await changePlan(await ctx("billing.write"), id, { plan: s(fd, "plan") as "pro", status: s(fd, "status") as "active", expiresOn: s(fd, "expiresOn"), reason: s(fd, "reason") || undefined });
    return "plan";
  });
}

export async function recordPaymentAction(fd: FormData) {
  const id = Id.parse(s(fd, "id"));
  await run(`/admin_pro/businesses/${id}`, async () => {
    await recordPlanPayment(await ctx("billing.write"), id, { plan: s(fd, "plan") as "pro", months: s(fd, "months"), amount: s(fd, "amount").replace(/\s| /g, ""), method: s(fd, "method") as "cash", reference: s(fd, "reference") || undefined });
    return "payment";
  });
}

export async function suspendAction(fd: FormData) {
  const id = Id.parse(s(fd, "id"));
  const on = s(fd, "on") === "1";
  await run(`/admin_pro/businesses/${id}`, async () => {
    await setSuspended(await ctx("businesses.write"), id, on, s(fd, "reason") || undefined);
    return on ? "suspended" : "reactivated";
  });
}

export async function publishAction(fd: FormData) {
  const id = Id.parse(s(fd, "id"));
  const on = s(fd, "on") === "1";
  await run(`/admin_pro/businesses/${id}`, async () => {
    await setPublished(await ctx("businesses.write"), id, on);
    return on ? "published" : "unpublished";
  });
}

export async function featuredAction(fd: FormData) {
  const id = Id.parse(s(fd, "id"));
  const raw = s(fd, "rank");
  const back = s(fd, "back") === "settings" ? "/admin_pro/settings" : `/admin_pro/businesses/${id}`;
  await run(back, async () => {
    await setFeatured(await ctx("businesses.write"), id, raw ? z.coerce.number().int().min(1).max(3).parse(raw) : null);
    return "featured";
  });
}

export async function noteAction(fd: FormData) {
  const id = Id.parse(s(fd, "id"));
  await run(`/admin_pro/businesses/${id}#notes`, async () => {
    await addNote(await ctx("businesses.read"), id, s(fd, "body"));
    return "note";
  });
}

export async function resolveErrorAction(fd: FormData) {
  const raw = s(fd, "id");
  await run("/admin_pro/activity", async () => {
    await resolveErrors(await ctx("activity"), raw === "all" ? "all" : Id.parse(raw));
    return "resolved";
  });
}

export async function freeLaunchAction(fd: FormData) {
  await run("/admin_pro/settings", async () => {
    const c = await ctx("settings");
    const on = s(fd, "on") === "1";
    await savePlatformSetting(c.db, "freeLaunch", on, c.actor.email);
    await writeAudit(c.db, c.actor, { restaurantId: null, action: "admin.free_launch", entity: "platform", data: { on } });
    return "saved";
  });
}

export async function announcementAction(fd: FormData) {
  await run("/admin_pro/settings", async () => {
    const c = await ctx("comms");
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

// ---- Team (collaborators) ----

async function teamCtx() {
  const actor = await requireSuperadmin("team");
  return { db: getDb(), actor };
}

const permsFrom = (fd: FormData) => fd.getAll("perms").map(String);

export async function addCollaboratorAction(fd: FormData) {
  await run("/admin_pro/team", async () => {
    const c = await teamCtx();
    const preset = s(fd, "preset");
    const perms = preset && PERM_PRESETS[preset] ? PERM_PRESETS[preset]! : permsFrom(fd);
    await addCollaborator(c, c.actor.perms, { email: s(fd, "email"), name: s(fd, "name"), perms });
    return "collabAdded";
  });
}

export async function updateCollaboratorAction(fd: FormData) {
  const id = Id.parse(s(fd, "id"));
  await run("/admin_pro/team", async () => {
    const c = await teamCtx();
    const active = s(fd, "active");
    await updateCollaborator(c, c.actor.perms, id, active ? { active: active === "1" } : { perms: permsFrom(fd) });
    return "collabSaved";
  });
}

export async function removeCollaboratorAction(fd: FormData) {
  const id = Id.parse(s(fd, "id"));
  await run("/admin_pro/team", async () => {
    await removeCollaborator(await teamCtx(), id);
    return "collabRemoved";
  });
}

// ---- Support requests ----

export async function supportReplyAction(fd: FormData) {
  const id = Id.parse(s(fd, "id"));
  await run(`/admin_pro/support/${id}`, async () => {
    const actor = await requireSuperadmin("support");
    const status = s(fd, "status");
    await adminReply(getDb(), actor, id, { body: s(fd, "body"), status: (STATUSES as readonly string[]).includes(status) ? (status as "new") : undefined, assign: s(fd, "assign") === "1" });
    return "supportSaved";
  });
}

// ---- Messages & notifications ----

function messageInputFrom(fd: FormData) {
  const list = (k: string) =>
    s(fd, k)
      .split(/[,;\n]/)
      .map((x) => x.trim())
      .filter(Boolean);
  return {
    kind: s(fd, "kind"),
    title: { fr: s(fd, "titleFr"), en: s(fd, "titleEn"), zh: s(fd, "titleZh") },
    body: { fr: s(fd, "bodyFr"), en: s(fd, "bodyEn"), zh: s(fd, "bodyZh") },
    link: s(fd, "link"),
    to: s(fd, "to"),
    plans: fd.getAll("plans").map(String),
    kinds: fd.getAll("kinds").map(String),
    cities: list("cities"),
    rcCodes: list("rcCodes"),
    restaurantIds: fd.getAll("restaurantIds").map(String).filter(Boolean),
    popup: s(fd, "popup") === "on",
    email: s(fd, "email") === "on",
    expiresInDays: s(fd, "expiresInDays") || undefined,
  };
}

export async function sendMessageAction(fd: FormData) {
  await run("/admin_pro/messages", async () => {
    const actor = await requireSuperadmin("comms");
    const db = getDb();
    const { message, emails } = await sendPlatformMessage(db, actor, messageInputFrom(fd));
    if (emails.length) {
      const base = await publicBaseUrl();
      after(() => emailPlatformMessage(db, message.id, emails, base));
    }
    return "messageSent";
  });
}

export async function withdrawMessageAction(fd: FormData) {
  const id = Id.parse(s(fd, "id"));
  await run("/admin_pro/messages", async () => {
    await deleteMessage(getDb(), await requireSuperadmin("comms"), id);
    return "messageWithdrawn";
  });
}
