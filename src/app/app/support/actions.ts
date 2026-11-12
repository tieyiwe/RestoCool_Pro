"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { requireMember } from "@/lib/auth/context";
import { notifyAdminsOfRequest } from "@/lib/support/alerts";
import { businessReply, createAppRequest } from "@/lib/support/requests";
import { rateLimit } from "@/lib/rate-limit";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const isLead = (role: string) => role === "owner" || role === "manager";

/** « Signaler un problème »: anyone in the team can send one, from any screen. */
export async function createSupportRequestAction(fd: FormData) {
  const ctx = await requireMember("restaurant.read");
  const who = ctx.actor.memberId ?? ctx.actor.userId;
  if (!rateLimit(`support:${who}`, { capacity: 6, refillPerSec: 1 / 600 })) redirect("/app/support?error=tooMany");
  let ref = "";
  try {
    const r = await createAppRequest(
      getDb(),
      ctx.actor,
      { category: s(fd, "category"), urgency: s(fd, "urgency"), subject: s(fd, "subject"), body: s(fd, "body"), pageUrl: s(fd, "from") || undefined, contact: s(fd, "contact") || undefined },
      { userAgent: (await headers()).get("user-agent"), fallbackName: ctx.pin?.name ?? null },
    );
    ref = String(r.number);
    const id = r.id;
    after(() => notifyAdminsOfRequest(getDb(), id));
  } catch (err) {
    if (err instanceof z.ZodError) redirect("/app/support?error=invalid");
    throw err;
  }
  redirect(`/app/support?sent=${ref}`);
}

export async function replySupportRequestAction(fd: FormData) {
  const ctx = await requireMember("restaurant.read");
  const id = z.uuid().parse(s(fd, "id"));
  try {
    await businessReply(getDb(), ctx.actor, id, s(fd, "body"), isLead(ctx.actor.role) ? null : (ctx.actor.memberId ?? "none"));
  } catch (err) {
    if (err instanceof z.ZodError) redirect(`/app/support?error=invalid#r-${id}`);
    throw err;
  }
  redirect(`/app/support?replied=1#r-${id}`);
}
