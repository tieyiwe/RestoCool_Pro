import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { adminCollaborators, auditLog, restaurants } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { ADMIN_PERMS, ADMIN_ROLES, normalizePerms, OWNER_ONLY_PERMS, ROLE_PERMS, roleFor, type AdminPerm, type AdminRole } from "./access";
import type { AdminCtx } from "./manage";

type Who = AdminCtx["actor"] & { owner: boolean };
type Ctx = AdminCtx & { actor: Who };

const Email = z.email().max(200).transform((e) => e.trim().toLowerCase());
const Role = z.enum([...ADMIN_ROLES, "custom"]);

/** Someone with every right (an owner, or a collaborator with the « Super admin » role). */
const isFull = (own: ReadonlySet<AdminPerm>, who: Who) => who.owner || ADMIN_PERMS.every((p) => own.has(p));

/**
 * What this person may hand out: owners everything; a « Super admin » collaborator every right
 * except the « Super admin » role itself; others only rights they hold, never « team » or « settings ».
 */
export function canGive(who: Who, own: ReadonlySet<AdminPerm>, p: AdminPerm): boolean {
  if (who.owner) return true;
  if (!own.has(p)) return false;
  return isFull(own, who) || !OWNER_ONLY_PERMS.has(p);
}

/** Roles this person may choose in the form. */
export function grantableRoles(who: Who, own: ReadonlySet<AdminPerm>): AdminRole[] {
  return [...ADMIN_ROLES.filter((r) => (r === "superadmin" ? who.owner : ROLE_PERMS[r].every((p) => canGive(who, own, p)))), "custom"];
}

function resolve(who: Who, own: ReadonlySet<AdminPerm>, role: AdminRole, perms: readonly string[]): { role: AdminRole; perms: AdminPerm[] } {
  if (role === "superadmin" && !who.owner) throw new ForbiddenError();
  const list = role === "custom" ? normalizePerms(perms) : ROLE_PERMS[role];
  for (const p of list) if (!canGive(who, own, p)) throw new ForbiddenError();
  return { role: role === "custom" ? roleFor(list) : role, perms: [...list] };
}

/** Only owners touch someone who has every right; nobody changes their own access. */
function assertCanEdit(ctx: Ctx, own: ReadonlySet<AdminPerm>, c: typeof adminCollaborators.$inferSelect) {
  if (c.email === ctx.actor.email) throw new ForbiddenError();
  if (!ctx.actor.owner && (c.role === "superadmin" || c.perms.some((p) => !canGive(ctx.actor, own, p as AdminPerm)))) throw new ForbiddenError();
}

export async function listCollaborators(db: DB) {
  return db.select().from(adminCollaborators).orderBy(asc(adminCollaborators.createdAt));
}

export async function getCollaborator(db: DB, id: string) {
  const [c] = await db.select().from(adminCollaborators).where(eq(adminCollaborators.id, id));
  return c ?? null;
}

export function consoleOwners(): string[] {
  return [...env.superadminEmails()];
}

export async function addCollaborator(ctx: Ctx, own: ReadonlySet<AdminPerm>, input: { email: string; name?: string; role?: string; perms?: string[] }) {
  const email = Email.parse(input.email);
  if (env.superadminEmails().has(email)) throw new z.ZodError([]);
  const { role, perms } = resolve(ctx.actor, own, Role.parse(input.role || "custom"), input.perms ?? []);
  if (!perms.length) throw new z.ZodError([]);
  const name = input.name?.trim().slice(0, 80) || null;
  const [existing] = await ctx.db.select().from(adminCollaborators).where(eq(adminCollaborators.email, email));
  if (existing) assertCanEdit(ctx, own, existing);
  const [row] = await ctx.db
    .insert(adminCollaborators)
    .values({ email, name, role, perms, addedBy: ctx.actor.email })
    .onConflictDoUpdate({ target: adminCollaborators.email, set: { name, role, perms, active: true, updatedAt: new Date() } })
    .returning();
  await writeAudit(ctx.db, ctx.actor, { restaurantId: null, action: "admin.collaborator_added", entity: "admin_collaborator", entityId: row!.id, data: { email, role, perms } });
  return row!;
}

async function load(ctx: AdminCtx, id: string) {
  const c = await getCollaborator(ctx.db, id);
  if (!c) throw new NotFoundError();
  return c;
}

/**
 * Change someone's role (its rights replace theirs), their rights one by one (the role becomes
 * « custom » unless they match a role), or switch them off/on.
 */
export async function updateCollaborator(ctx: Ctx, own: ReadonlySet<AdminPerm>, id: string, input: { role?: string; perms?: string[]; active?: boolean; name?: string }) {
  const c = await load(ctx, id);
  assertCanEdit(ctx, own, c);
  const set: Partial<typeof adminCollaborators.$inferInsert> = { updatedAt: new Date() };
  if (input.role !== undefined || input.perms !== undefined) {
    const role = Role.parse(input.role ?? "custom");
    // A role change applies that role's rights; otherwise the ticked rights are kept as they are.
    const r = role !== c.role && role !== "custom" ? resolve(ctx.actor, own, role, []) : resolve(ctx.actor, own, "custom", input.perms ?? c.perms);
    if (!r.perms.length) throw new z.ZodError([]);
    set.role = r.role;
    set.perms = r.perms;
  }
  if (input.active !== undefined) set.active = input.active;
  if (input.name !== undefined) set.name = input.name.trim().slice(0, 80) || null;
  await ctx.db.update(adminCollaborators).set(set).where(eq(adminCollaborators.id, id));
  const action = input.active === false ? "admin.collaborator_disabled" : input.active === true ? "admin.collaborator_enabled" : "admin.collaborator_updated";
  await writeAudit(ctx.db, ctx.actor, {
    restaurantId: null,
    action,
    entity: "admin_collaborator",
    entityId: id,
    data: { email: c.email, from: { role: c.role, perms: c.perms }, to: { role: set.role ?? c.role, perms: set.perms ?? c.perms } },
  });
}

export async function removeCollaborator(ctx: Ctx, own: ReadonlySet<AdminPerm>, id: string) {
  const c = await load(ctx, id);
  assertCanEdit(ctx, own, c);
  await ctx.db.delete(adminCollaborators).where(eq(adminCollaborators.id, id));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: null, action: "admin.collaborator_removed", entity: "admin_collaborator", entityId: id, data: { email: c.email, role: c.role } });
}

export async function markInvited(db: DB, id: string, status: "sent" | "skipped" | "failed") {
  await db
    .update(adminCollaborators)
    .set({ invitedAt: new Date(), inviteStatus: status, inviteCount: sql`${adminCollaborators.inviteCount} + 1` })
    .where(eq(adminCollaborators.id, id));
}

// ---- Activity log ----

export type ActivityFilter = { who?: string; action?: string; days?: number; limit?: number };

/**
 * What console people did: every change (plans, payments, messages, recovery, access…), plus
 * sign-ins and pages opened. Recorded in audit_log under their email.
 */
export async function consoleActivity(db: DB, f: ActivityFilter = {}) {
  const conds = [eq(auditLog.actorType, "superadmin")];
  if (f.who) conds.push(eq(auditLog.actorId, f.who.toLowerCase()));
  if (f.action === "changes") conds.push(sql`${auditLog.action} not in ('admin.viewed', 'admin.signed_in')`);
  else if (f.action === "visits") conds.push(sql`${auditLog.action} in ('admin.viewed', 'admin.signed_in')`);
  if (f.days) conds.push(sql`${auditLog.createdAt} >= now() - make_interval(days => ${f.days})`);
  return db
    .select({ id: auditLog.id, at: auditLog.createdAt, who: auditLog.actorId, action: auditLog.action, entity: auditLog.entity, entityId: auditLog.entityId, data: auditLog.data, ip: auditLog.ip, business: restaurants.name, restaurantId: auditLog.restaurantId })
    .from(auditLog)
    .leftJoin(restaurants, eq(restaurants.id, auditLog.restaurantId))
    .where(and(...conds))
    .orderBy(desc(auditLog.createdAt))
    .limit(Math.min(f.limit ?? 200, 1000));
}

/** Per person: number of changes and page views over 30 days, last activity. */
export async function activitySummary(db: DB) {
  const rows = await db
    .select({
      who: auditLog.actorId,
      changes: sql<number>`count(*) filter (where ${auditLog.action} not in ('admin.viewed', 'admin.signed_in'))::int`,
      views: sql<number>`count(*) filter (where ${auditLog.action} = 'admin.viewed')::int`,
      signIns: sql<number>`count(*) filter (where ${auditLog.action} = 'admin.signed_in')::int`,
      last: sql<Date>`max(${auditLog.createdAt})`,
    })
    .from(auditLog)
    .where(and(eq(auditLog.actorType, "superadmin"), sql`${auditLog.createdAt} >= now() - interval '30 days'`))
    .groupBy(auditLog.actorId);
  return new Map(rows.map((r) => [r.who ?? "", { ...r, last: r.last ? new Date(r.last) : null }]));
}
