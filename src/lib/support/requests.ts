import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { accessCodes, members, restaurants, supportMessages, supportRequests } from "@/db/schema";
import { normalizeCode } from "@/lib/access-code-format";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/can";
import { NotFoundError } from "@/lib/errors";

export const URGENCIES = ["low", "medium", "high"] as const;
export const CATEGORIES = ["bug", "orders", "menu", "access", "billing", "question", "idea"] as const;
export const STATUSES = ["new", "in_progress", "waiting", "resolved"] as const;
export type Urgency = (typeof URGENCIES)[number];
export type RequestStatus = (typeof STATUSES)[number];

/** « D-000123 »: the reference both sides use. */
export const requestRef = (n: number) => `D-${String(n).padStart(6, "0")}`;

const Text = (max: number) => z.string().trim().min(1).max(max);

export const AppRequestInput = z.object({
  category: z.enum(CATEGORIES),
  urgency: z.enum(URGENCIES),
  subject: Text(140),
  body: Text(4000),
  pageUrl: z.string().max(300).optional(),
  contact: z.string().trim().max(120).optional(),
});

export const PublicRequestInput = z.object({
  rc: z.string().trim().min(3).max(20),
  businessName: Text(120),
  name: Text(80),
  phone: z.string().trim().min(6).max(30),
  role: z.string().trim().max(60).optional(),
  urgency: z.enum(URGENCIES),
  body: Text(2000),
});

type Member = { memberId: string | null; name: string | null; role: string; phone: string | null; email: string | null };

async function memberInfo(db: DB, restaurantId: string, memberId?: string | null, userId?: string): Promise<Member> {
  const [m] = memberId
    ? await db.select().from(members).where(and(eq(members.id, memberId), eq(members.restaurantId, restaurantId)))
    : userId
      ? await db.select().from(members).where(and(eq(members.clerkUserId, userId), eq(members.restaurantId, restaurantId)))
      : [];
  return { memberId: m?.id ?? null, name: m?.name ?? m?.email ?? null, role: m?.role ?? "owner", phone: m?.phone ?? null, email: m?.email ?? null };
}

/** A request sent from the business app: the business, the person and the screen are recorded. */
export async function createAppRequest(db: DB, actor: Extract<Actor, { kind: "member" }>, raw: unknown, meta: { userAgent?: string | null; fallbackName?: string | null }) {
  const input = AppRequestInput.parse(raw);
  const m = await memberInfo(db, actor.restaurantId, actor.memberId, actor.userId);
  const path = input.pageUrl && /^\/[\w\-/.:?=&%]*$/.test(input.pageUrl) ? input.pageUrl.slice(0, 300) : null;
  return db.transaction(async (tx) => {
    const [r] = await tx
      .insert(supportRequests)
      .values({
        restaurantId: actor.restaurantId,
        memberId: m.memberId,
        source: "app",
        name: m.name ?? meta.fallbackName ?? "—",
        role: m.role,
        contact: input.contact || m.phone || m.email,
        category: input.category,
        urgency: input.urgency,
        subject: input.subject,
        body: input.body,
        pageUrl: path,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
      })
      .returning();
    await tx.insert(supportMessages).values({ requestId: r!.id, from: "business", author: r!.name, body: input.body });
    await writeAudit(tx, actor, { restaurantId: actor.restaurantId, action: "support.requested", entity: "support_request", entityId: r!.id, data: { urgency: input.urgency, category: input.category } });
    return r!;
  });
}

/**
 * A request from someone who cannot sign in (/aide): matched to the business by its numéro RC,
 * never shown anything back about it. TIBLOGICS verifies identity before helping.
 */
export async function createPublicRequest(db: DB, raw: unknown, meta: { userAgent?: string | null }) {
  const input = PublicRequestInput.parse(raw);
  const code = normalizeCode(input.rc);
  const [match] = code
    ? await db.select({ restaurantId: accessCodes.restaurantId }).from(accessCodes).where(and(eq(accessCodes.code, code), isNull(accessCodes.seatId))).limit(1)
    : [];
  const [r] = await db
    .insert(supportRequests)
    .values({
      restaurantId: match?.restaurantId ?? null,
      source: "public",
      name: input.name,
      role: input.role ?? null,
      contact: input.phone,
      rcCode: code ?? input.rc.slice(0, 20),
      category: "access",
      urgency: input.urgency,
      subject: input.businessName,
      body: input.body,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    })
    .returning();
  await db.insert(supportMessages).values({ requestId: r!.id, from: "business", author: input.name, body: input.body });
  return { ref: requestRef(r!.number) };
}

/** The business's requests: owners/managers see them all, others only their own. */
export async function listBusinessRequests(db: DB, restaurantId: string, onlyMemberId?: string | null) {
  const where = onlyMemberId ? and(eq(supportRequests.restaurantId, restaurantId), eq(supportRequests.memberId, onlyMemberId)) : eq(supportRequests.restaurantId, restaurantId);
  const list = await db.select().from(supportRequests).where(where).orderBy(desc(supportRequests.lastMessageAt)).limit(50);
  const ids = list.map((r) => r.id);
  const msgs = ids.length ? await db.select().from(supportMessages).where(inArray(supportMessages.requestId, ids)).orderBy(supportMessages.createdAt) : [];
  return list.map((r) => ({ ...r, ref: requestRef(r.number), messages: msgs.filter((m) => m.requestId === r.id) }));
}

export async function unreadForBusiness(db: DB, restaurantId: string, onlyMemberId?: string | null): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(supportRequests)
    .where(and(eq(supportRequests.restaurantId, restaurantId), eq(supportRequests.unreadForBusiness, true), onlyMemberId ? eq(supportRequests.memberId, onlyMemberId) : undefined));
  return r?.n ?? 0;
}

export async function markBusinessRead(db: DB, restaurantId: string, ids: string[]) {
  if (!ids.length) return;
  await db.update(supportRequests).set({ unreadForBusiness: false }).where(and(eq(supportRequests.restaurantId, restaurantId), inArray(supportRequests.id, ids)));
}

/** The business adds a message to its own request (re-opens it if it was resolved). */
export async function businessReply(db: DB, actor: Extract<Actor, { kind: "member" }>, requestId: string, body: string, onlyMemberId?: string | null) {
  const text = Text(4000).parse(body);
  const [r] = await db.select().from(supportRequests).where(and(eq(supportRequests.id, requestId), eq(supportRequests.restaurantId, actor.restaurantId)));
  if (!r || (onlyMemberId && r.memberId !== onlyMemberId)) throw new NotFoundError();
  const m = await memberInfo(db, actor.restaurantId, actor.memberId, actor.userId);
  await db.transaction(async (tx) => {
    await tx.insert(supportMessages).values({ requestId, from: "business", author: m.name ?? r.name, body: text });
    await tx
      .update(supportRequests)
      .set({ lastMessageAt: new Date(), status: r.status === "resolved" || r.status === "waiting" ? "in_progress" : r.status, resolvedAt: null })
      .where(eq(supportRequests.id, requestId));
  });
}

// ---- Console side ----

export type InboxFilter = { status?: RequestStatus | "open" | "all"; urgency?: Urgency; restaurantId?: string; q?: string };

export async function adminInbox(db: DB, f: InboxFilter) {
  const conds = [];
  if (!f.status || f.status === "open") conds.push(sql`${supportRequests.status} <> 'resolved'`);
  else if (f.status !== "all") conds.push(eq(supportRequests.status, f.status));
  if (f.urgency) conds.push(eq(supportRequests.urgency, f.urgency));
  if (f.restaurantId) conds.push(eq(supportRequests.restaurantId, f.restaurantId));
  if (f.q?.trim()) {
    const q = `%${f.q.trim().replace(/[%_]/g, "")}%`;
    const num = /^d-?0*(\d+)$/i.exec(f.q.trim());
    conds.push(
      num
        ? eq(supportRequests.number, Number(num[1]))
        : sql`(${supportRequests.subject} ilike ${q} or ${supportRequests.body} ilike ${q} or ${supportRequests.name} ilike ${q} or ${restaurants.name} ilike ${q} or ${supportRequests.rcCode} ilike ${q})`,
    );
  }
  const rows = await db
    .select({ r: supportRequests, business: restaurants.name, slug: restaurants.slug, city: restaurants.city })
    .from(supportRequests)
    .leftJoin(restaurants, eq(restaurants.id, supportRequests.restaurantId))
    .where(conds.length ? and(...conds) : undefined)
    // Urgent first, then oldest waiting first (first in, first answered).
    .orderBy(sql`case ${supportRequests.urgency} when 'high' then 0 when 'medium' then 1 else 2 end`, sql`case ${supportRequests.status} when 'new' then 0 when 'in_progress' then 1 when 'waiting' then 2 else 3 end`, supportRequests.createdAt)
    .limit(200);
  return rows.map((x) => ({ ...x.r, ref: requestRef(x.r.number), business: x.business, slug: x.slug, city: x.city }));
}

export async function inboxCounts(db: DB) {
  const [r] = await db
    .select({
      open: sql<number>`count(*) filter (where status <> 'resolved')::int`,
      fresh: sql<number>`count(*) filter (where status = 'new')::int`,
      urgent: sql<number>`count(*) filter (where status <> 'resolved' and urgency = 'high')::int`,
    })
    .from(supportRequests);
  return { open: r?.open ?? 0, fresh: r?.fresh ?? 0, urgent: r?.urgent ?? 0 };
}

export async function adminRequest(db: DB, id: string) {
  const [x] = await db
    .select({ r: supportRequests, business: restaurants.name, slug: restaurants.slug, city: restaurants.city, phones: restaurants.phones, whatsapp: restaurants.whatsapp })
    .from(supportRequests)
    .leftJoin(restaurants, eq(restaurants.id, supportRequests.restaurantId))
    .where(eq(supportRequests.id, id));
  if (!x) return null;
  const messages = await db.select().from(supportMessages).where(eq(supportMessages.requestId, id)).orderBy(supportMessages.createdAt);
  return { ...x.r, ref: requestRef(x.r.number), business: x.business, slug: x.slug, city: x.city, phones: x.phones, whatsapp: x.whatsapp, messages };
}

type AdminActorLike = Extract<Actor, { kind: "superadmin" }> & { name?: string | null };

export async function adminReply(db: DB, actor: AdminActorLike, id: string, input: { body?: string; status?: RequestStatus; assign?: boolean }) {
  const [r] = await db.select().from(supportRequests).where(eq(supportRequests.id, id));
  if (!r) throw new NotFoundError();
  const body = input.body?.trim() ? Text(4000).parse(input.body) : null;
  const status = input.status ? z.enum(STATUSES).parse(input.status) : body && r.status === "new" ? "in_progress" : r.status;
  const now = new Date();
  await db.transaction(async (tx) => {
    if (body) await tx.insert(supportMessages).values({ requestId: id, from: "admin", author: `RestoCool · ${actor.name ?? actor.email.split("@")[0]}`, body });
    await tx
      .update(supportRequests)
      .set({
        status,
        assignedTo: input.assign ? actor.email : r.assignedTo,
        firstResponseAt: body && !r.firstResponseAt ? now : r.firstResponseAt,
        resolvedAt: status === "resolved" ? (r.resolvedAt ?? now) : null,
        lastMessageAt: body ? now : r.lastMessageAt,
        unreadForBusiness: body ? true : status !== r.status ? true : r.unreadForBusiness,
        updatedAt: now,
      })
      .where(eq(supportRequests.id, id));
    await writeAudit(tx, actor, { restaurantId: r.restaurantId, action: "support.answered", entity: "support_request", entityId: id, data: { status, replied: Boolean(body) } });
  });
  return r;
}
