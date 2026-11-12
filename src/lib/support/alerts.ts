import "server-only";
import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { restaurants, supportRequests } from "@/db/schema";
import { sendMail } from "@/lib/email/mailer";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { publicBaseUrl } from "@/lib/urls";
import { requestRef } from "./requests";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * A new request reaches TIBLOGICS: always in the console inbox; an urgent one (« bloquant ») is
 * also emailed to the console owners when email is configured.
 */
export async function notifyAdminsOfRequest(db: DB, id: string) {
  try {
    const [x] = await db.select({ r: supportRequests, business: restaurants.name }).from(supportRequests).leftJoin(restaurants, eq(restaurants.id, supportRequests.restaurantId)).where(eq(supportRequests.id, id));
    if (!x || x.r.urgency !== "high") return;
    const base = await publicBaseUrl().catch(() => process.env.APP_URL ?? "");
    const link = `${base}/admin_pro/support/${id}`;
    const subject = `🔴 ${requestRef(x.r.number)} · ${x.business ?? x.r.subject} — ${x.r.subject}`;
    const text = `${x.business ?? "?"} · ${x.r.name}${x.r.role ? ` (${x.r.role})` : ""} · ${x.r.contact ?? ""}\n\n${x.r.body}\n\n${link}`;
    const html = `<p><b>${esc(x.business ?? "?")}</b> · ${esc(x.r.name)}${x.r.role ? ` (${esc(x.r.role)})` : ""} · ${esc(x.r.contact ?? "")}</p><p style="white-space:pre-wrap">${esc(x.r.body)}</p><p><a href="${esc(link)}">${esc(link)}</a></p>`;
    for (const to of env.superadminEmails()) await sendMail({ to, subject: subject.slice(0, 200), text, html });
  } catch (err) {
    log.warn("support.alert_failed", { error: err instanceof Error ? err.message : String(err) });
  }
}

export async function notifyAdminsOfRequestRef(db: DB, ref: string) {
  const n = Number(/^D-(\d+)$/.exec(ref)?.[1]);
  if (!n) return;
  const [r] = await db.select({ id: supportRequests.id }).from(supportRequests).where(eq(supportRequests.number, n));
  if (r) await notifyAdminsOfRequest(db, r.id);
}
