import "server-only";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { ensureJobRoles } from "./role-catalog";
import { z } from "zod";
import type { DB } from "@/db";
import { jobRoles, members } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { ACCESS_AREAS, ROLE_GROUPS, cleanAccess, levelFor, type AccessArea, type RoleGroup } from "@/lib/auth/access";
import { can } from "@/lib/auth/can";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import type { PersonnelCtx } from "./attendance";

export { ensureJobRoles };

export type JobRole = { id: string; key: string | null; name: string | null; group: RoleGroup; access: AccessArea[]; holders: number };

const isLead = (access: readonly string[]) => access.includes("staff");

export async function listJobRoles(db: DB, restaurantId: string): Promise<JobRole[]> {
  await ensureJobRoles(db, restaurantId);
  const rows = await db
    .select({
      id: jobRoles.id,
      key: jobRoles.key,
      name: jobRoles.name,
      group: jobRoles.group,
      access: jobRoles.access,
      holders: sql<number>`(select count(*)::int from ${members} m where m.job_role_id = ${jobRoles.id} and m.active)`,
    })
    .from(jobRoles)
    .where(eq(jobRoles.restaurantId, restaurantId))
    .orderBy(asc(jobRoles.sort), asc(jobRoles.createdAt));
  return rows.map((r) => ({ ...r, group: (ROLE_GROUPS as readonly string[]).includes(r.group) ? (r.group as RoleGroup) : "support", access: cleanAccess(r.access) }));
}

/** Editing the roles themselves is for the owner only. */
function needOwner(ctx: PersonnelCtx) {
  if (!can(ctx.actor, "managers.write", { restaurantId: ctx.repo.restaurantId })) throw new ForbiddenError();
}

export class RoleError extends AppError {
  constructor(public readonly code: "duplicate" | "inUse") {
    super(code, 409);
  }
}

const Access = z.array(z.enum(ACCESS_AREAS)).max(ACCESS_AREAS.length);
export const NewRoleInput = z.object({
  name: z.string().trim().min(2).max(40),
  group: z.enum(ROLE_GROUPS),
  access: Access,
});

async function roleOf(ctx: PersonnelCtx, id: string) {
  const r = await ctx.db.query.jobRoles.findFirst({ where: and(eq(jobRoles.restaurantId, ctx.repo.restaurantId), eq(jobRoles.id, id)) });
  if (!r) throw new NotFoundError();
  return r;
}

/** A role the owner types in (« Caissière principale », « Chef grillades »…). */
export async function createJobRole(ctx: PersonnelCtx, input: z.input<typeof NewRoleInput>) {
  needOwner(ctx);
  const d = NewRoleInput.parse(input);
  const rid = ctx.repo.restaurantId;
  await ensureJobRoles(ctx.db, rid);
  const clash = await ctx.db
    .select({ id: jobRoles.id })
    .from(jobRoles)
    .where(and(eq(jobRoles.restaurantId, rid), sql`lower(${jobRoles.name}) = lower(${d.name})`))
    .limit(1);
  if (clash.length) throw new RoleError("duplicate");
  const [{ max }] = (await ctx.db.execute<{ max: number }>(sql`select coalesce(max(sort), 0)::int as max from job_roles where restaurant_id = ${rid}`)).rows as [{ max: number }];
  const [row] = await ctx.db
    .insert(jobRoles)
    .values({ restaurantId: rid, key: null, name: d.name, group: d.group, access: cleanAccess(d.access), sort: max + 1 })
    .returning();
  await writeAudit(ctx.db, ctx.actor, { restaurantId: rid, action: "role.created", entity: "job_role", entityId: row!.id, data: { name: d.name, access: d.access } });
  return row!;
}

/** Changes what a role gives access to; everyone holding it gets the new access right away. */
export async function updateJobRoleAccess(ctx: PersonnelCtx, id: string, access: readonly string[]) {
  needOwner(ctx);
  const list = cleanAccess(Access.parse(access));
  const role = await roleOf(ctx, id);
  await ctx.db.transaction(async (tx) => {
    await tx.update(jobRoles).set({ access: list }).where(eq(jobRoles.id, role.id));
    await tx
      .update(members)
      .set({ role: levelFor(list) })
      .where(and(eq(members.restaurantId, ctx.repo.restaurantId), eq(members.jobRoleId, role.id), ne(members.role, "owner")));
    await writeAudit(tx, ctx.actor, { restaurantId: ctx.repo.restaurantId, action: "role.access", entity: "job_role", entityId: role.id, data: { from: role.access, to: list } });
  });
}

/** Removes a role nobody holds (people keep working: give them another role first). */
export async function deleteJobRole(ctx: PersonnelCtx, id: string) {
  needOwner(ctx);
  const role = await roleOf(ctx, id);
  const [used] = await ctx.db.select({ id: members.id }).from(members).where(eq(members.jobRoleId, role.id)).limit(1);
  if (used) throw new RoleError("inUse");
  await ctx.db.delete(jobRoles).where(eq(jobRoles.id, role.id));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: ctx.repo.restaurantId, action: "role.deleted", entity: "job_role", entityId: role.id });
}

/**
 * Gives a person a role. Managers (staff.write) assign roles; giving or taking away a role that
 * manages the personnel is for the owner. The owner's own role never changes.
 */
export async function assignJobRole(ctx: PersonnelCtx, memberId: string, roleId: string) {
  const rid = ctx.repo.restaurantId;
  if (!can(ctx.actor, "staff.write", { restaurantId: rid })) throw new ForbiddenError();
  const owner = can(ctx.actor, "managers.write", { restaurantId: rid });
  const m = await ctx.db.query.members.findFirst({ where: and(eq(members.restaurantId, rid), eq(members.id, memberId)) });
  if (!m) throw new NotFoundError();
  if (m.role === "owner") throw new ForbiddenError();
  const role = await roleOf(ctx, roleId);
  const access = cleanAccess(role.access);
  if (!owner && (m.role === "manager" || isLead(access))) throw new ForbiddenError();
  await ctx.db.update(members).set({ jobRoleId: role.id, role: levelFor(access) }).where(eq(members.id, m.id));
  await writeAudit(ctx.db, ctx.actor, { restaurantId: rid, action: "personnel.role", entity: "member", entityId: m.id, data: { roleId: role.id, key: role.key, name: role.name } });
}

/** The role a new person gets (validated, with the level it implies). */
export async function roleForNewPerson(ctx: PersonnelCtx, roleId: string) {
  const role = await roleOf(ctx, roleId);
  const access = cleanAccess(role.access);
  if (isLead(access) && !can(ctx.actor, "managers.write", { restaurantId: ctx.repo.restaurantId })) throw new ForbiddenError();
  return { id: role.id, level: levelFor(access) };
}
