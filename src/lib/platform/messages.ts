import "server-only";
import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { accessCodes, members, platformMessageReads, platformMessages, restaurants, type MessageAudience } from "@/db/schema";
import { normalizeCode } from "@/lib/access-code-format";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/can";
import { sendMail } from "@/lib/email/mailer";
import { log } from "@/lib/log";
import { notify } from "@/lib/realtime/events";

export const MESSAGE_KINDS = ["feature", "news", "maintenance", "billing", "message"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];
const AUDIENCE_TO = ["owners", "managers", "everyone"] as const;

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || undefined);

export const MessageInput = z.object({
  kind: z.enum(MESSAGE_KINDS),
  title: z.object({ fr: z.string().trim().min(2).max(140), en: opt(140), zh: opt(140) }),
  body: z.object({ fr: z.string().trim().min(2).max(3000), en: opt(3000), zh: opt(3000) }),
  link: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || v.startsWith("/") || v.startsWith("https://"), "link")
    .optional()
    .transform((v) => v || undefined),
  to: z.enum(AUDIENCE_TO),
  plans: z.array(z.enum(["gratuit", "pro", "business"])).default([]),
  kinds: z.array(z.enum(["restaurant", "transport"])).default([]),
  cities: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  /** Numéros RC (with or without « RC- »): only those businesses. */
  rcCodes: z.array(z.string().trim().min(3).max(20)).max(200).default([]),
  restaurantIds: z.array(z.uuid()).max(200).default([]),
  popup: z.boolean().default(false),
  email: z.boolean().default(false),
  expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
});
export type MessageInputT = z.input<typeof MessageInput>;

/** « ouagadougou » = « Ouagadougou ». */
const cityKey = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

type Biz = { id: string; plan: string; kind: string; city: string | null };

export function businessMatches(a: MessageAudience, r: Biz): boolean {
  if (a.restaurantIds?.length && !a.restaurantIds.includes(r.id)) return false;
  if (a.plans?.length && !a.plans.includes(r.plan)) return false;
  if (a.kinds?.length && !a.kinds.includes(r.kind)) return false;
  if (a.cities?.length && !a.cities.map(cityKey).includes(cityKey(r.city))) return false;
  return true;
}

export function roleMatches(to: MessageAudience["to"], role: string): boolean {
  if (to === "everyone") return true;
  if (to === "managers") return role === "owner" || role === "manager";
  return role === "owner";
}

async function audienceFrom(db: DB, input: z.output<typeof MessageInput>): Promise<MessageAudience> {
  const ids = new Set(input.restaurantIds);
  const codes = input.rcCodes.map(normalizeCode).filter((c): c is string => Boolean(c));
  if (codes.length) {
    const rows = await db.select({ id: accessCodes.restaurantId }).from(accessCodes).where(and(inArray(accessCodes.code, codes), isNull(accessCodes.seatId)));
    for (const r of rows) ids.add(r.id);
    // RC numbers given but none known: refuse rather than send to everyone.
    if (!rows.length) throw new z.ZodError([{ code: "custom", path: ["rcCodes"], message: "unknown", input: input.rcCodes }]);
  }
  return {
    to: input.to,
    ...(ids.size ? { restaurantIds: [...ids] } : {}),
    ...(input.plans.length ? { plans: input.plans } : {}),
    ...(input.kinds.length ? { kinds: input.kinds } : {}),
    ...(input.cities.length ? { cities: input.cities } : {}),
  };
}

/** Everyone who will see it (active members of matching businesses with a matching role). */
async function recipients(db: DB, a: MessageAudience) {
  const biz = (await db.select({ id: restaurants.id, plan: restaurants.plan, kind: restaurants.kind, city: restaurants.city }).from(restaurants)).filter((r) => businessMatches(a, r));
  if (!biz.length) return { biz, people: [] as Array<{ id: string; role: string; email: string | null; restaurantId: string }> };
  const people = (
    await db
      .select({ id: members.id, role: members.role, email: members.email, restaurantId: members.restaurantId })
      .from(members)
      .where(and(eq(members.active, true), inArray(members.restaurantId, biz.map((b) => b.id))))
  ).filter((m) => roleMatches(a.to, m.role));
  return { biz, people };
}

export async function previewAudience(db: DB, raw: unknown) {
  const input = MessageInput.parse(raw);
  const { biz, people } = await recipients(db, await audienceFrom(db, input));
  return { businesses: biz.length, people: people.length };
}

/** Sends a message: stored, shown in the app (bell, pop-up for features), pushed live, optionally emailed. */
export async function sendPlatformMessage(db: DB, actor: Extract<Actor, { kind: "superadmin" }>, raw: unknown) {
  const input = MessageInput.parse(raw);
  const audience = await audienceFrom(db, input);
  const { biz, people } = await recipients(db, audience);
  const [m] = await db
    .insert(platformMessages)
    .values({
      kind: input.kind,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      audience,
      popup: input.popup,
      email: input.email,
      recipients: people.length,
      createdBy: actor.email,
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null,
    })
    .returning();
  await writeAudit(db, actor, { restaurantId: biz.length === 1 ? biz[0]!.id : null, action: "admin.message_sent", entity: "platform_message", entityId: m!.id, data: { kind: input.kind, audience, recipients: people.length } });
  // Live: open staff screens refresh their bell (one event for many businesses).
  if (biz.length === 1) await notify(db, { k: "notice", r: biz[0]!.id });
  else await notify(db, { k: "notice", r: "*" });
  return { message: m!, emails: input.email ? [...new Set(people.filter((p) => p.role === "owner" && p.email).map((p) => p.email!.toLowerCase()))] : [] };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Emails a message to the owners (background). Counts what was really sent. */
export async function emailPlatformMessage(db: DB, messageId: string, to: string[], baseUrl: string) {
  const [m] = await db.select().from(platformMessages).where(eq(platformMessages.id, messageId));
  if (!m) return;
  const link = m.link ? (m.link.startsWith("/") ? `${baseUrl}${m.link}` : m.link) : `${baseUrl}/app/notifications`;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f1e7;font-family:Arial,sans-serif;color:#1d1d1b">
<div style="max-width:560px;margin:0 auto;padding:24px">
<p style="font-weight:bold;font-size:20px;margin:0 0 16px">Resto<span style="color:#0f7a43">Cool</span></p>
<div style="background:#fff;border-radius:16px;padding:24px">
<h1 style="font-size:20px;margin:0 0 12px">${esc(m.title.fr)}</h1>
<p style="white-space:pre-wrap;line-height:1.5;margin:0 0 20px">${esc(m.body.fr)}</p>
<a href="${esc(link)}" style="display:inline-block;background:#0f7a43;color:#fff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px">Ouvrir RestoCool</a>
</div>
<p style="font-size:12px;color:#6b6b6b;margin-top:16px">Message de l’équipe RestoCool (TIBLOGICS) aux propriétaires d’établissements.</p>
</div></body></html>`;
  const text = `${m.title.fr}\n\n${m.body.fr}\n\n${link}`;
  let sent = 0;
  for (const addr of to) {
    try {
      const r = await sendMail({ to: addr, subject: `RestoCool · ${m.title.fr}`.slice(0, 180), html, text });
      if (r.status === "sent") sent++;
    } catch (err) {
      log.warn("message.email_failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }
  await db.update(platformMessages).set({ emailedCount: sent }).where(eq(platformMessages.id, messageId));
}

// ---- Business side ----

type Viewer = { memberId: string; restaurantId: string; role: string };

/** Messages for this person: their business and role match, recent, not expired. */
export async function messagesFor(db: DB, v: Viewer, limit = 50) {
  const [r] = await db.select({ id: restaurants.id, plan: restaurants.plan, kind: restaurants.kind, city: restaurants.city }).from(restaurants).where(eq(restaurants.id, v.restaurantId));
  if (!r) return [];
  const [m] = await db.select({ createdAt: members.createdAt }).from(members).where(eq(members.id, v.memberId));
  // Someone who joined recently doesn't get months of old news.
  const since = new Date(Math.max(Date.now() - 120 * 86_400_000, (m?.createdAt ?? new Date()).getTime() - 30 * 86_400_000));
  const rows = await db
    .select({ m: platformMessages, readAt: platformMessageReads.readAt })
    .from(platformMessages)
    .leftJoin(platformMessageReads, and(eq(platformMessageReads.messageId, platformMessages.id), eq(platformMessageReads.memberId, v.memberId)))
    .where(and(gte(platformMessages.createdAt, since), or(isNull(platformMessages.expiresAt), gte(platformMessages.expiresAt, sql`now()`))))
    .orderBy(desc(platformMessages.createdAt))
    .limit(200);
  return rows
    .filter((x) => businessMatches(x.m.audience, r) && roleMatches(x.m.audience.to, v.role))
    .slice(0, limit)
    .map((x) => ({ ...x.m, read: Boolean(x.readAt) }));
}

export async function markMessagesRead(db: DB, v: Viewer, ids: string[]) {
  const mine = new Set((await messagesFor(db, v, 200)).map((m) => m.id));
  const ok = ids.filter((id) => mine.has(id));
  if (!ok.length) return;
  await db
    .insert(platformMessageReads)
    .values(ok.map((messageId) => ({ messageId, memberId: v.memberId })))
    .onConflictDoNothing();
}

export async function readStats(db: DB, ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const rows = await db
    .select({ id: platformMessageReads.messageId, n: sql<number>`count(*)::int` })
    .from(platformMessageReads)
    .where(inArray(platformMessageReads.messageId, ids))
    .groupBy(platformMessageReads.messageId);
  return new Map(rows.map((r) => [r.id, r.n]));
}

export async function sentMessages(db: DB, limit = 50) {
  return db.select().from(platformMessages).orderBy(desc(platformMessages.createdAt)).limit(limit);
}

export async function deleteMessage(db: DB, actor: Extract<Actor, { kind: "superadmin" }>, id: string) {
  // « Withdraw »: it stops showing (expires now); the record stays for history.
  await db.update(platformMessages).set({ expiresAt: new Date() }).where(eq(platformMessages.id, id));
  await writeAudit(db, actor, { restaurantId: null, action: "admin.message_withdrawn", entity: "platform_message", entityId: id });
}
