import "server-only";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { adminCollaborators } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { normalizePerms, OWNER_ONLY_PERMS, type AdminPerm } from "./access";
import type { AdminCtx } from "./manage";

type Who = AdminCtx["actor"] & { owner: boolean };

const Email = z.email().max(200).transform((e) => e.trim().toLowerCase());

/** A collaborator may hand out only permissions they have; « team » and « settings » only by owners. */
function allowedPerms(who: Who, perms: AdminPerm[], ownPerms: ReadonlySet<AdminPerm>): AdminPerm[] {
  for (const p of perms) {
    if (OWNER_ONLY_PERMS.has(p) && !who.owner) throw new ForbiddenError();
    if (!who.owner && !ownPerms.has(p)) throw new ForbiddenError();
  }
  return perms;
}

export async function listCollaborators(db: AdminCtx["db"]) {
  return db.select().from(adminCollaborators).orderBy(asc(adminCollaborators.createdAt));
}

export function consoleOwners(): string[] {
  return [...env.superadminEmails()];
}

export async function addCollaborator(ctx: AdminCtx & { actor: Who }, own: ReadonlySet<AdminPerm>, input: { email: string; name?: string; perms: string[] }) {
  const email = Email.parse(input.email);
  if (env.superadminEmails().has(email)) throw new z.ZodError([]);
  const perms = allowedPerms(ctx.actor, normalizePerms(input.perms), own);
  const name = input.name?.trim().slice(0, 80) || null;
  const [row] = await ctx.db
    .insert(adminCollaborators)
    .values({ email, name, perms, addedBy: ctx.actor.email })
    .onConflictDoUpdate({ target: adminCollaborators.email, set: { name, perms, active: true, updatedAt: new Date() } })
    .returning();
  await writeAudit(ctx.db, ctx.actor, { restaurantId: null, action: "admin.collaborator_added", entity: "admin_collaborator", entityId: row!.id, data: { email, perms } });
  return row!;
}

async function load(ctx: AdminCtx, id: string) {
  const [c] = await ctx.db.select().from(adminCollaborators).where(eq(adminCollaborators.id, id));
  if (!c) throw new NotFoundError();
  return c;
}

export async function updateCollaborator(ctx: AdminCtx & { actor: Who }, own: ReadonlySet<AdminPerm>, id: string, input: { perms?: string[]; active?: boolean; name?: string }) {
  const c = await load(ctx, id);
  // Nobody changes their own access (an owner does it for them).
  if (c.email === ctx.actor.email) throw new ForbiddenError();
  // A non-owner may not touch someone holding owner-only rights.
  if (!ctx.actor.owner && c.perms.some((p) => OWNER_ONLY_PERMS.has(p as AdminPerm))) throw new ForbiddenError();
  const set: Partial<typeof adminCollaborators.$inferInsert> = { updatedAt: new Date() };
  if (input.perms) {
    // Rights the editor cannot hand out are left as they were (their boxes are greyed out).
    const canGive = (p: AdminPerm) => ctx.actor.owner || (own.has(p) && !OWNER_ONLY_PERMS.has(p));
    const kept = c.perms.filter((p) => !canGive(p as AdminPerm));
    const asked = normalizePerms(input.perms).filter(canGive);
    set.perms = allowedPerms(ctx.actor, normalizePerms([...asked, ...kept]).filter((p) => canGive(p) || kept.includes(p)), own.size ? new Set([...own, ...(kept as AdminPerm[])]) : own);
  }
  if (input.active !== undefined) set.active = input.active;
  if (input.name !== undefined) set.name = input.name.trim().slice(0, 80) || null;
  await ctx.db.update(adminCollaborators).set(set).where(eq(adminCollaborators.id, id));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: null, action: input.active === false ? "admin.collaborator_disabled" : input.active === true ? "admin.collaborator_enabled" : "admin.collaborator_updated", entity: "admin_collaborator", entityId: id, data: { email: c.email, perms: set.perms ?? c.perms } });
}

export async function removeCollaborator(ctx: AdminCtx & { actor: Who }, id: string) {
  const c = await load(ctx, id);
  if (c.email === ctx.actor.email) throw new ForbiddenError();
  if (!ctx.actor.owner && c.perms.some((p) => OWNER_ONLY_PERMS.has(p as AdminPerm))) throw new ForbiddenError();
  await ctx.db.delete(adminCollaborators).where(eq(adminCollaborators.id, id));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: null, action: "admin.collaborator_removed", entity: "admin_collaborator", entityId: id, data: { email: c.email } });
}
