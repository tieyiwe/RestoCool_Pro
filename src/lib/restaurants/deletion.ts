import "server-only";
import { and, desc, eq, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { accessCodes, deletionRequests, members, restaurants, staffSessions } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/can";
import { sendMail } from "@/lib/email/mailer";
import { env } from "@/lib/env";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { log } from "@/lib/log";

/** The request takes effect this long after it is made (the team calls the owner meanwhile). */
export const DELETION_DELAY_HOURS = 72;
/** After deletion, the business can be restored intact for this long, then it is removed for good. */
export const RESTORE_DAYS = 10;

export type DeletionRequest = typeof deletionRequests.$inferSelect;
type MemberActor = Extract<Actor, { kind: "member" }>;
type AdminActor = Extract<Actor, { kind: "superadmin" }>;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const DeletionInput = z.object({
  /** A few sentences: why, so the team can understand and call back. */
  reason: z
    .string()
    .trim()
    .min(60)
    .max(2000)
    .refine((v) => v.split(/[.!?…]+/).filter((x) => x.trim().length > 3).length >= 2, "sentences"),
  /** The business name typed exactly (accents and case ignored). */
  confirmName: z.string().trim().min(1).max(160),
  understood: z.literal(true),
});

/** The request in progress for a business (pending or confirmed), or its latest deletion. */
export async function currentDeletion(db: DB, restaurantId: string) {
  const [r] = await db
    .select()
    .from(deletionRequests)
    .where(and(eq(deletionRequests.restaurantId, restaurantId), inArray(deletionRequests.status, ["pending", "confirmed", "deleted"])))
    .orderBy(desc(deletionRequests.createdAt))
    .limit(1);
  return r ?? null;
}

async function ownerOf(db: DB, actor: MemberActor, restaurantId: string) {
  const [m] = await db
    .select()
    .from(members)
    .where(and(eq(members.restaurantId, restaurantId), eq(members.clerkUserId, actor.userId), eq(members.role, "owner"), eq(members.active, true)));
  // Only the owner, signed in with their own account (never a PIN session on a shared tablet).
  if (!m || actor.via === "pin") throw new ForbiddenError();
  return m;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fmt = (d: Date) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Africa/Ouagadougou" }).format(d);

function mailHtml(title: string, lines: string[], cta?: { label: string; href: string }) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#fff8ec;font-family:Arial,sans-serif;color:#17231c">
<div style="max-width:560px;margin:0 auto;padding:24px">
<p style="font-weight:bold;font-size:20px;margin:0 0 16px">Resto<span style="color:#0f7a43">Cool</span></p>
<div style="background:#fff;border-radius:16px;padding:24px">
<h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
${lines.map((l) => `<p style="line-height:1.5;margin:0 0 12px">${esc(l)}</p>`).join("")}
${cta ? `<a href="${esc(cta.href)}" style="display:inline-block;background:#0f7a43;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px">${esc(cta.label)}</a>` : ""}
</div>
<p style="font-size:12px;color:#6b6b6b;margin-top:16px">RestoCool · TIBLOGICS — info@restocool.com</p>
</div></body></html>`;
}

async function mail(to: string | null | undefined, subject: string, title: string, lines: string[], cta?: { label: string; href: string }) {
  if (!to) return;
  try {
    await sendMail({ to, subject, html: mailHtml(title, lines, cta), text: [title, ...lines, cta ? `${cta.label} : ${cta.href}` : ""].join("\n\n") });
  } catch (err) {
    log.warn("deletion.mail_failed", { error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * The owner asks to delete the business. Nothing changes yet: it takes effect after 72 h, and
 * only once the RestoCool team has confirmed it with the owner. Emails: the owner and the team.
 */
export async function requestDeletion(db: DB, actor: MemberActor, restaurantId: string, raw: unknown, baseUrl: string) {
  const input = DeletionInput.parse(raw);
  const owner = await ownerOf(db, actor, restaurantId);
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId));
  if (!r || r.deletedAt) throw new NotFoundError();
  if (norm(input.confirmName) !== norm(r.name)) throw new z.ZodError([{ code: "custom", path: ["confirmName"], message: "name", input: input.confirmName }]);
  if (await currentDeletion(db, restaurantId)) throw new ForbiddenError();
  const [code] = await db.select({ code: accessCodes.code }).from(accessCodes).where(and(eq(accessCodes.restaurantId, restaurantId), isNull(accessCodes.seatId))).limit(1);
  const effectiveAt = new Date(Date.now() + DELETION_DELAY_HOURS * 3600_000);
  const [req] = await db
    .insert(deletionRequests)
    .values({
      restaurantId,
      businessName: r.name,
      rcCode: code?.code ?? null,
      ownerEmail: owner.email,
      ownerName: owner.name,
      requestedBy: actor.userId,
      reason: input.reason,
      effectiveAt,
      wasPublished: r.published,
    })
    .returning();
  await writeAudit(db, actor, { restaurantId, action: "restaurant.deletion_requested", entity: "restaurant", entityId: restaurantId, data: { requestId: req!.id, effectiveAt: effectiveAt.toISOString() } });
  await mail(
    owner.email,
    `RestoCool · Demande de suppression de « ${r.name} »`,
    "Nous avons bien reçu votre demande de suppression",
    [
      `Votre demande de suppression de « ${r.name} » est enregistrée. Elle prendra effet au plus tôt le ${fmt(effectiveAt)} (72 heures), et seulement après confirmation par l’équipe RestoCool.`,
      "D’ici là, notre équipe vous contactera pour s’assurer que vous voulez vraiment continuer. Votre établissement reste en ligne et fonctionne normalement.",
      `Après la suppression, vous aurez encore ${RESTORE_DAYS} jours pour le restaurer intact. Vous pouvez aussi annuler la demande à tout moment depuis votre application.`,
    ],
    { label: "Ouvrir RestoCool", href: `${baseUrl}/app/settings/danger` },
  );
  for (const to of env.superadminEmails()) {
    await mail(to, `[RestoCool] Deletion request: ${r.name}`, `Deletion request — ${r.name}`, [
      `Owner: ${owner.name ?? "—"} · ${owner.email ?? "no email"} · RC-${code?.code ?? "?"}`,
      `Effective at the earliest: ${effectiveAt.toISOString()} (after your confirmation).`,
      `Reason: ${input.reason}`,
    ], { label: "Open the console", href: `${baseUrl}/admin_pro/deletions` });
  }
  return req!;
}

/** The owner changes their mind (before the deletion happens). */
export async function cancelDeletion(db: DB, actor: MemberActor, restaurantId: string) {
  await ownerOf(db, actor, restaurantId);
  const cur = await currentDeletion(db, restaurantId);
  if (!cur || (cur.status !== "pending" && cur.status !== "confirmed")) throw new NotFoundError();
  await db.update(deletionRequests).set({ status: "cancelled", decidedAt: new Date(), decidedBy: `owner:${actor.userId}`, updatedAt: new Date() }).where(eq(deletionRequests.id, cur.id));
  await writeAudit(db, actor, { restaurantId, action: "restaurant.deletion_cancelled", entity: "restaurant", entityId: restaurantId, data: { requestId: cur.id } });
}

// ---- Console ----

export async function listDeletionRequests(db: DB) {
  return db.select().from(deletionRequests).orderBy(desc(deletionRequests.createdAt)).limit(200);
}

export async function openDeletionCount(db: DB) {
  const rows = await db.select({ id: deletionRequests.id }).from(deletionRequests).where(inArray(deletionRequests.status, ["pending", "confirmed"]));
  return rows.length;
}

async function loadReq(db: DB, id: string) {
  const [r] = await db.select().from(deletionRequests).where(eq(deletionRequests.id, id));
  if (!r) throw new NotFoundError();
  return r;
}

export async function markContacted(db: DB, actor: AdminActor, id: string, note?: string) {
  const r = await loadReq(db, id);
  await db.update(deletionRequests).set({ contactedAt: new Date(), contactedBy: actor.email, adminNote: note?.trim().slice(0, 1000) || r.adminNote, updatedAt: new Date() }).where(eq(deletionRequests.id, id));
  await writeAudit(db, actor, { restaurantId: r.restaurantId, action: "admin.deletion_contacted", entity: "deletion_request", entityId: id });
}

/** The team confirmed with the owner: the deletion happens when the 72 h are over. */
export async function confirmDeletion(db: DB, actor: AdminActor, id: string, note?: string) {
  const r = await loadReq(db, id);
  if (r.status !== "pending") throw new ForbiddenError();
  await db.update(deletionRequests).set({ status: "confirmed", decidedAt: new Date(), decidedBy: actor.email, adminNote: note?.trim().slice(0, 1000) || r.adminNote, updatedAt: new Date() }).where(eq(deletionRequests.id, id));
  await writeAudit(db, actor, { restaurantId: r.restaurantId, action: "admin.deletion_confirmed", entity: "deletion_request", entityId: id });
  await processDeletions(db);
}

export async function refuseDeletion(db: DB, actor: AdminActor, id: string, note?: string) {
  const r = await loadReq(db, id);
  if (r.status !== "pending" && r.status !== "confirmed") throw new ForbiddenError();
  await db.update(deletionRequests).set({ status: "refused", decidedAt: new Date(), decidedBy: actor.email, adminNote: note?.trim().slice(0, 1000) || r.adminNote, updatedAt: new Date() }).where(eq(deletionRequests.id, id));
  await writeAudit(db, actor, { restaurantId: r.restaurantId, action: "admin.deletion_refused", entity: "deletion_request", entityId: id });
}

/** Back exactly as it was (menu online again if it was), during the 10 days. */
export async function restoreDeleted(db: DB, actor: Actor, id: string) {
  const r = await loadReq(db, id);
  if (r.status !== "deleted" || !r.restaurantId || !r.restoreUntil || r.restoreUntil < new Date()) throw new ForbiddenError();
  if (actor.kind === "member") {
    const [m] = await db.select({ id: members.id }).from(members).where(and(eq(members.restaurantId, r.restaurantId), eq(members.clerkUserId, actor.userId), eq(members.role, "owner")));
    if (!m || actor.via === "pin") throw new ForbiddenError();
  } else if (actor.kind !== "superadmin") throw new ForbiddenError();
  await db.transaction(async (tx) => {
    await tx.update(restaurants).set({ deletedAt: null, published: r.wasPublished, updatedAt: new Date() }).where(eq(restaurants.id, r.restaurantId!));
    await tx.update(deletionRequests).set({ status: "restored", restoredAt: new Date(), updatedAt: new Date() }).where(eq(deletionRequests.id, id));
    await writeAudit(tx, actor, { restaurantId: r.restaurantId, action: "restaurant.restored", entity: "restaurant", entityId: r.restaurantId! });
  });
  await mail(r.ownerEmail, `RestoCool · « ${r.businessName} » est restauré`, "Votre établissement est restauré", [
    `« ${r.businessName} » est de nouveau actif, avec toutes ses données (menu, équipe, commandes, réglages).`,
  ]);
}

/** Restorable deletions for an owner who signs in (their businesses are hidden from the app). */
export async function restorableFor(db: DB, clerkUserId: string) {
  return db
    .select({ id: deletionRequests.id, name: deletionRequests.businessName, restoreUntil: deletionRequests.restoreUntil })
    .from(deletionRequests)
    .innerJoin(members, and(eq(members.restaurantId, deletionRequests.restaurantId), eq(members.clerkUserId, clerkUserId), eq(members.role, "owner")))
    .where(eq(deletionRequests.status, "deleted"));
}

/**
 * Runs every few minutes (and right after a confirmation): confirmed requests whose 72 h are
 * over are carried out (business offline and closed, data kept, owner emailed); deletions whose
 * 10 days are over are removed for good.
 */
export async function processDeletions(db: DB, now = new Date(), baseUrl = process.env.APP_URL ?? "https://restocool.com") {
  const due = await db.select().from(deletionRequests).where(and(eq(deletionRequests.status, "confirmed"), lte(deletionRequests.effectiveAt, now)));
  for (const r of due) {
    if (!r.restaurantId) continue;
    const restoreUntil = new Date(now.getTime() + RESTORE_DAYS * 86_400_000);
    await db.transaction(async (tx) => {
      await tx.update(restaurants).set({ deletedAt: now, published: false, featuredRank: null, updatedAt: now }).where(eq(restaurants.id, r.restaurantId!));
      await tx.update(staffSessions).set({ endedAt: now }).where(and(eq(staffSessions.restaurantId, r.restaurantId!), isNull(staffSessions.endedAt)));
      await tx.update(deletionRequests).set({ status: "deleted", deletedAt: now, restoreUntil, updatedAt: now }).where(eq(deletionRequests.id, r.id));
      await writeAudit(tx, null, { restaurantId: r.restaurantId, action: "restaurant.deleted", entity: "restaurant", entityId: r.restaurantId!, data: { requestId: r.id, restoreUntil: restoreUntil.toISOString() } });
    });
    await mail(
      r.ownerEmail,
      `RestoCool · « ${r.businessName} » a été supprimé`,
      "Votre établissement a été supprimé",
      [
        `Comme vous l’avez demandé, « ${r.businessName} » a été supprimé le ${fmt(now)}. Il n’est plus visible et votre équipe n’y a plus accès.`,
        `Vous pouvez encore le restaurer intact (menu, équipe, commandes, réglages) jusqu’au ${fmt(restoreUntil)}. Connectez-vous à RestoCool avec ce compte et touchez « Restaurer ».`,
        "Après cette date, toutes les données seront définitivement effacées.",
      ],
      { label: "Restaurer mon établissement", href: `${baseUrl}/app/new` },
    );
  }
  const expired = await db.select().from(deletionRequests).where(and(eq(deletionRequests.status, "deleted"), lte(deletionRequests.restoreUntil, now)));
  for (const r of expired) {
    if (r.restaurantId) {
      // data-safe: the owner asked, the team confirmed, and the 10 days to restore are over.
      await db.delete(restaurants).where(and(eq(restaurants.id, r.restaurantId), lte(restaurants.deletedAt, now)));
    }
    await db.update(deletionRequests).set({ status: "purged", purgedAt: now, updatedAt: now }).where(eq(deletionRequests.id, r.id));
    await writeAudit(db, null, { restaurantId: null, action: "restaurant.purged", entity: "deletion_request", entityId: r.id, data: { business: r.businessName } });
  }
  return { deleted: due.length, purged: expired.length };
}
