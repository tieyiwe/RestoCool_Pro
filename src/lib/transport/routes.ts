import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { members, routeAssignments, routes } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { can } from "@/lib/auth/can";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import type { SeatingCtx } from "@/lib/seating/admin";

export class RouteError extends Error {
  constructor(public readonly code: "duplicate" | "invalid") {
    super(code);
  }
}

const City = z.string().trim().min(2).max(60);
export const RouteInput = z.object({ origin: City, destination: City }).refine((r) => r.origin.toLowerCase() !== r.destination.toLowerCase());

export const routeLabel = (r: { origin: string; destination: string }) => `${r.origin} → ${r.destination}`;

/** Itineraries with the people assigned to each. */
export async function listRoutes(db: DB, restaurantId: string) {
  const rows = await db.select().from(routes).where(eq(routes.restaurantId, restaurantId)).orderBy(asc(routes.sort), asc(routes.origin), asc(routes.destination));
  const assigned = rows.length
    ? await db
        .select({ routeId: routeAssignments.routeId, memberId: members.id, name: members.name, staffNo: members.staffNo })
        .from(routeAssignments)
        .innerJoin(members, eq(members.id, routeAssignments.memberId))
        .where(and(eq(routeAssignments.restaurantId, restaurantId), inArray(routeAssignments.routeId, rows.map((r) => r.id))))
    : [];
  return rows.map((r) => ({ ...r, label: routeLabel(r), people: assigned.filter((a) => a.routeId === r.id) }));
}

export async function createRoute(ctx: SeatingCtx, input: z.input<typeof RouteInput>) {
  if (!can(ctx.actor, "seats.write", { restaurantId: ctx.repo.restaurantId })) throw new ForbiddenError();
  const p = RouteInput.safeParse(input);
  if (!p.success) throw new RouteError("invalid");
  const rid = ctx.repo.restaurantId;
  const clash = await ctx.db
    .select({ id: routes.id })
    .from(routes)
    .where(and(eq(routes.restaurantId, rid), sql`lower(${routes.origin}) = lower(${p.data.origin})`, sql`lower(${routes.destination}) = lower(${p.data.destination})`))
    .limit(1);
  if (clash.length) throw new RouteError("duplicate");
  const [{ n }] = (await ctx.db.execute<{ n: number }>(sql`select coalesce(max(sort), 0)::int as n from routes where restaurant_id = ${rid}`)).rows as [{ n: number }];
  const [r] = await ctx.db.insert(routes).values({ restaurantId: rid, origin: p.data.origin, destination: p.data.destination, sort: n + 1 }).returning();
  await writeAudit(ctx.db, ctx.actor, { restaurantId: rid, action: "transport.route.created", entity: "route", entityId: r!.id, data: { label: routeLabel(r!) } });
  return r!;
}

export async function deleteRoute(ctx: SeatingCtx, routeId: string) {
  if (!can(ctx.actor, "seats.write", { restaurantId: ctx.repo.restaurantId })) throw new ForbiddenError();
  const done = await ctx.db.delete(routes).where(and(eq(routes.id, routeId), eq(routes.restaurantId, ctx.repo.restaurantId))).returning({ id: routes.id });
  if (!done.length) throw new NotFoundError("route");
  await writeAudit(ctx.db, ctx.actor, { restaurantId: ctx.repo.restaurantId, action: "transport.route.deleted", entity: "route", entityId: routeId });
}

/** Who works on this itinerary (replaces the list). Only people of this business. */
export async function setRouteAssignments(ctx: SeatingCtx, routeId: string, memberIds: string[]) {
  if (!can(ctx.actor, "staff.write", { restaurantId: ctx.repo.restaurantId })) throw new ForbiddenError();
  const rid = ctx.repo.restaurantId;
  const route = await ctx.db.query.routes.findFirst({ where: and(eq(routes.id, routeId), eq(routes.restaurantId, rid)) });
  if (!route) throw new NotFoundError("route");
  const ids = [...new Set(memberIds.filter((x) => z.uuid().safeParse(x).success))];
  const valid = ids.length
    ? (await ctx.db.select({ id: members.id }).from(members).where(and(eq(members.restaurantId, rid), inArray(members.id, ids)))).map((m) => m.id)
    : [];
  await ctx.db.transaction(async (tx) => {
    await tx.delete(routeAssignments).where(eq(routeAssignments.routeId, route.id));
    if (valid.length) await tx.insert(routeAssignments).values(valid.map((memberId) => ({ restaurantId: rid, routeId: route.id, memberId })));
  });
  await writeAudit(ctx.db, ctx.actor, { restaurantId: rid, action: "transport.route.assigned", entity: "route", entityId: route.id, data: { people: valid.length } });
}

/** Itineraries a person is assigned to (a hostess sees and starts trips on these). */
export async function routesOfMember(db: DB, restaurantId: string, memberId: string) {
  return db
    .select({ id: routes.id, origin: routes.origin, destination: routes.destination })
    .from(routeAssignments)
    .innerJoin(routes, eq(routes.id, routeAssignments.routeId))
    .where(and(eq(routeAssignments.restaurantId, restaurantId), eq(routeAssignments.memberId, memberId), eq(routes.active, true)));
}
