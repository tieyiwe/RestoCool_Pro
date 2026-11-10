import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import type { TenantRepo } from "@/db/repos/tenant";
import { accessCodes, areas, seats, sessionDevices, tableSessions, type I18nText } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import type { Actor } from "@/lib/auth/can";
import { NotFoundError } from "@/lib/errors";
import { notify } from "@/lib/realtime/events";
import { randomToken } from "@/lib/tokens";
import { tableNumbers } from "./tables";

/** Seating writes. Every id from the browser is re-checked against ctx.repo.restaurantId. */
export type SeatingCtx = { db: DB; actor: Actor; repo: TenantRepo };
export class SeatingError extends Error {
  constructor(public readonly code: "duplicate" | "invalid") {
    super(code);
  }
}

const i18n = (t: { fr: string; en?: string; zh?: string }): I18nText => ({
  fr: t.fr.trim(),
  ...(t.en?.trim() ? { en: t.en.trim() } : {}),
  ...(t.zh?.trim() ? { zh: t.zh.trim() } : {}),
});

export const AreaInput = z.object({ fr: z.string().trim().min(1).max(60), en: z.string().max(60).optional(), zh: z.string().max(60).optional() });
export const SEAT_TYPES = ["table", "room", "area", "counter", "takeaway", "delivery"] as const;
export const SeatInput = z.object({
  type: z.enum(SEAT_TYPES),
  label: z.string().trim().min(1).max(40),
  areaId: z.uuid().nullable(),
  capacity: z.number().int().min(1).max(500).nullable(),
});
export const TablesInput = z.object({
  from: z.number().int().min(1).max(999),
  to: z.number().int().min(1).max(999),
  skip: z.array(z.number().int()).max(200),
  areaId: z.uuid().nullable(),
  capacity: z.number().int().min(1).max(500).nullable(),
});

async function ownArea(ctx: SeatingCtx, areaId: string | null) {
  if (!areaId) return null;
  const a = await ctx.db.query.areas.findFirst({ where: and(eq(areas.restaurantId, ctx.repo.restaurantId), eq(areas.id, areaId)) });
  if (!a) throw new NotFoundError("area");
  return a.id;
}

async function ownSeat(ctx: SeatingCtx, seatId: string) {
  const s = await ctx.db.query.seats.findFirst({ where: and(eq(seats.restaurantId, ctx.repo.restaurantId), eq(seats.id, seatId)) });
  if (!s) throw new NotFoundError("seat");
  return s;
}

const audit = (ctx: SeatingCtx, action: string, entity: string, entityId: string | null, data?: Record<string, unknown>) =>
  writeAudit(ctx.db, ctx.actor, { restaurantId: ctx.repo.restaurantId, action, entity, entityId, data });

/* ---------- areas ---------- */

export async function createArea(ctx: SeatingCtx, input: z.input<typeof AreaInput>) {
  const name = i18n(AreaInput.parse(input));
  const [max] = await ctx.db.select({ n: sql<number>`coalesce(max(${areas.sort}),0)::int` }).from(areas).where(eq(areas.restaurantId, ctx.repo.restaurantId));
  const [row] = await ctx.db.insert(areas).values({ restaurantId: ctx.repo.restaurantId, name, sort: (max?.n ?? 0) + 1 }).returning();
  await audit(ctx, "seating.area.created", "area", row!.id);
  return row!;
}

export async function renameArea(ctx: SeatingCtx, areaId: string, input: z.input<typeof AreaInput>) {
  await ownArea(ctx, areaId);
  await ctx.db.update(areas).set({ name: i18n(AreaInput.parse(input)) }).where(and(eq(areas.restaurantId, ctx.repo.restaurantId), eq(areas.id, areaId)));
  await audit(ctx, "seating.area.renamed", "area", areaId);
}

/** Seats of a deleted area stay, without an area. */
export async function deleteArea(ctx: SeatingCtx, areaId: string) {
  await ownArea(ctx, areaId);
  await ctx.db.delete(areas).where(and(eq(areas.restaurantId, ctx.repo.restaurantId), eq(areas.id, areaId)));
  await audit(ctx, "seating.area.deleted", "area", areaId);
}

/* ---------- seats ---------- */

/** Bulk-add numbered tables (e.g. 1 to 20 without 13). Existing numbers are left as they are. */
export async function addTables(ctx: SeatingCtx, input: z.input<typeof TablesInput>) {
  const d = TablesInput.parse(input);
  const areaId = await ownArea(ctx, d.areaId);
  const wanted = tableNumbers(d.from, d.to, d.skip).map(String);
  if (wanted.length === 0) throw new SeatingError("invalid");
  const rid = ctx.repo.restaurantId;
  const existing = new Set(
    (await ctx.db.select({ label: seats.label }).from(seats).where(and(eq(seats.restaurantId, rid), eq(seats.type, "table"), inArray(seats.label, wanted)))).map((s) => s.label),
  );
  const toAdd = wanted.filter((l) => !existing.has(l));
  if (toAdd.length) {
    await ctx.db.insert(seats).values(toAdd.map((label) => ({ restaurantId: rid, type: "table" as const, label, areaId, capacity: d.capacity, qrToken: randomToken(), sort: Number(label) })));
  }
  await audit(ctx, "seating.tables.added", "seat", null, { added: toAdd.length, skippedExisting: existing.size });
  return { added: toAdd.length, existing: existing.size };
}

export async function addSeat(ctx: SeatingCtx, input: z.input<typeof SeatInput>) {
  const d = SeatInput.parse(input);
  const areaId = await ownArea(ctx, d.areaId);
  const rid = ctx.repo.restaurantId;
  const dup = await ctx.db.query.seats.findFirst({ where: and(eq(seats.restaurantId, rid), eq(seats.type, d.type), eq(seats.label, d.label)) });
  if (dup) throw new SeatingError("duplicate");
  const [max] = await ctx.db.select({ n: sql<number>`coalesce(max(${seats.sort}),0)::int` }).from(seats).where(and(eq(seats.restaurantId, rid), eq(seats.type, d.type)));
  const [row] = await ctx.db
    .insert(seats)
    .values({ restaurantId: rid, type: d.type, label: d.label, areaId, capacity: d.capacity, qrToken: randomToken(), sort: (max?.n ?? 0) + 1 })
    .returning();
  await audit(ctx, "seating.seat.added", "seat", row!.id, { type: d.type, label: d.label });
  return row!;
}

export async function updateSeat(ctx: SeatingCtx, seatId: string, input: { label: string; areaId: string | null; capacity: number | null; active: boolean }) {
  const s = await ownSeat(ctx, seatId);
  const d = SeatInput.parse({ type: s.type, label: input.label, areaId: input.areaId, capacity: input.capacity });
  const areaId = await ownArea(ctx, d.areaId);
  if (d.label !== s.label) {
    const dup = await ctx.db.query.seats.findFirst({ where: and(eq(seats.restaurantId, ctx.repo.restaurantId), eq(seats.type, s.type), eq(seats.label, d.label)) });
    if (dup) throw new SeatingError("duplicate");
  }
  await ctx.db
    .update(seats)
    .set({ label: d.label, areaId, capacity: d.capacity, active: input.active })
    .where(and(eq(seats.restaurantId, ctx.repo.restaurantId), eq(seats.id, seatId)));
  await audit(ctx, "seating.seat.updated", "seat", seatId);
}

export async function deleteSeat(ctx: SeatingCtx, seatId: string) {
  await ownSeat(ctx, seatId);
  await ctx.db.delete(seats).where(and(eq(seats.restaurantId, ctx.repo.restaurantId), eq(seats.id, seatId)));
  await audit(ctx, "seating.seat.deleted", "seat", seatId);
}

/** New QR token: printed cards with the old one stop working (lost or copied card). */
export async function regenerateToken(ctx: SeatingCtx, seatId: string) {
  await ownSeat(ctx, seatId);
  await ctx.db.update(seats).set({ qrToken: randomToken() }).where(and(eq(seats.restaurantId, ctx.repo.restaurantId), eq(seats.id, seatId)));
  // The typed code is a second way into the same seat: it changes too (a new one is made on next print).
  await ctx.db.delete(accessCodes).where(and(eq(accessCodes.restaurantId, ctx.repo.restaurantId), eq(accessCodes.seatId, seatId)));
  await audit(ctx, "seating.seat.qr_regenerated", "seat", seatId);
}

export async function moveSeat(ctx: SeatingCtx, seatId: string, dir: "up" | "down") {
  const s = await ownSeat(ctx, seatId);
  const rid = ctx.repo.restaurantId;
  const list = await ctx.db
    .select({ id: seats.id })
    .from(seats)
    .where(and(eq(seats.restaurantId, rid), eq(seats.type, s.type)))
    .orderBy(asc(seats.sort), asc(seats.label));
  const ids = list.map((x) => x.id);
  const i = ids.indexOf(seatId);
  const j = dir === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  await ctx.db.transaction(async (tx) => {
    for (const [k, id] of ids.entries()) await tx.update(seats).set({ sort: k + 1 }).where(and(eq(seats.restaurantId, rid), eq(seats.id, id)));
  });
}

/**
 * Counter, takeaway and delivery are one "seat" each. Keep them in step with the seating
 * modes chosen in Settings (created when switched on, deactivated when switched off).
 */
export async function syncSingletonSeats(db: DB, restaurantId: string, modes: readonly string[]) {
  const labels: Record<string, string> = { counter: "Comptoir", takeaway: "À emporter", delivery: "Livraison" };
  for (const type of ["counter", "takeaway", "delivery"] as const) {
    const on = modes.includes(type);
    const existing = await db.query.seats.findFirst({ where: and(eq(seats.restaurantId, restaurantId), eq(seats.type, type)) });
    if (existing) {
      if (existing.active !== on) await db.update(seats).set({ active: on }).where(eq(seats.id, existing.id));
    } else if (on) {
      await db.insert(seats).values({ restaurantId, type, label: labels[type]!, qrToken: randomToken(), sort: 1 });
    }
  }
}

/* ---------- sessions (staff view) ---------- */

export async function openSessions(ctx: SeatingCtx) {
  const rid = ctx.repo.restaurantId;
  const rows = await ctx.db
    .select({
      id: tableSessions.id,
      seatId: tableSessions.seatId,
      source: tableSessions.source,
      openedAt: tableSessions.openedAt,
      lastActivityAt: tableSessions.lastActivityAt,
      label: seats.label,
      type: seats.type,
      phones: sql<number>`(select count(*)::int from ${sessionDevices} d where d.session_id = ${tableSessions.id} and d.left_at is null)`,
    })
    .from(tableSessions)
    .innerJoin(seats, eq(seats.id, tableSessions.seatId))
    .where(and(eq(tableSessions.restaurantId, rid), eq(tableSessions.status, "open")))
    .orderBy(asc(tableSessions.openedAt));
  return rows;
}

export async function closeSessionByStaff(ctx: SeatingCtx, sessionId: string) {
  const rid = ctx.repo.restaurantId;
  const res = await ctx.db
    .update(tableSessions)
    .set({ status: "closed", closedAt: new Date(), closedReason: "staff", closedBy: ctx.actor.kind === "member" ? ctx.actor.userId : null })
    .where(and(eq(tableSessions.restaurantId, rid), eq(tableSessions.id, sessionId), eq(tableSessions.status, "open")))
    .returning({ id: tableSessions.id });
  if (res.length === 0) throw new NotFoundError("session");
  await audit(ctx, "seating.session.closed", "table_session", sessionId);
  await notify(ctx.db, { k: "session", r: rid, s: sessionId });
}
