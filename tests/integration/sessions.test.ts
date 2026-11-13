import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { closeDb, getDb } = await import("@/db");
const { tenantRepo } = await import("@/db/repos/tenant");
const { orders, restaurants, seats, tableSessions } = await import("@/db/schema");
const sessions = await import("@/lib/seating/sessions");
const admin = await import("@/lib/seating/admin");
const { createRestaurantForUser } = await import("@/lib/restaurants/provision");
const { NotFoundError } = await import("@/lib/errors");

const hasDb = Boolean(process.env.DATABASE_URL);
const PHONE_A = "phoneAAAAAAAAAAAAAAAA";
const PHONE_B = "phoneBBBBBBBBBBBBBBBB";

describe.skipIf(!hasDb)("table sessions and seating admin (database)", () => {
  const ids: string[] = [];
  type R = typeof restaurants.$inferSelect;
  let r: R;
  let other: R;
  let ctx: Parameters<typeof admin.addTables>[0];
  let otherCtx: Parameters<typeof admin.addTables>[0];
  const reload = async (id: string) => (await getDb().query.restaurants.findFirst({ where: eq(restaurants.id, id) }))!;

  beforeAll(async () => {
    r = await createRestaurantForUser(getDb(), { clerkUserId: "it-seat-a" }, { name: "Maquis Sièges", city: "Ouagadougou" });
    other = await createRestaurantForUser(getDb(), { clerkUserId: "it-seat-b" }, { name: "Maquis Voisin", city: "Ouagadougou" });
    ids.push(r.id, other.id);
    ctx = { db: getDb(), actor: { kind: "member", userId: "it-seat-a", restaurantId: r.id, role: "owner" }, repo: tenantRepo(getDb(), r.id) };
    otherCtx = { db: getDb(), actor: { kind: "member", userId: "it-seat-b", restaurantId: other.id, role: "owner" }, repo: tenantRepo(getDb(), other.id) };
  });
  afterAll(async () => {
    await getDb().delete(restaurants).where(inArray(restaurants.id, ids));
    await closeDb();
  });

  it("bulk-adds tables, skipping numbers and existing ones", async () => {
    expect(await admin.addTables(ctx, { from: 1, to: 5, skip: [3], areaId: null, capacity: 4 })).toEqual({ added: 4, existing: 0 });
    expect(await admin.addTables(ctx, { from: 4, to: 6, skip: [], areaId: null, capacity: null })).toEqual({ added: 1, existing: 2 });
    const labels = (await ctx.repo.seating.seats()).map((s) => s.label).sort();
    expect(labels).toEqual(["1", "2", "4", "5", "6"]);
  });

  it("refuses duplicates and another restaurant's area", async () => {
    await admin.addSeat(ctx, { type: "room", label: "Salon Ouaga", areaId: null, capacity: 10 });
    await expect(admin.addSeat(ctx, { type: "room", label: "Salon Ouaga", areaId: null, capacity: 10 })).rejects.toMatchObject({ code: "duplicate" });
    const foreignArea = await admin.createArea(otherCtx, { fr: "Terrasse" });
    await expect(admin.addSeat(ctx, { type: "room", label: "201", areaId: foreignArea.id, capacity: null })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("cannot edit, delete or regenerate another restaurant's seat", async () => {
    const seat = (await ctx.repo.seating.seats())[0]!;
    await expect(admin.deleteSeat(otherCtx, seat.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(admin.regenerateToken(otherCtx, seat.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(admin.updateSeat(otherCtx, seat.id, { label: "X", areaId: null, capacity: null, active: true })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a printed token only resolves within its own restaurant", async () => {
    const seat = (await ctx.repo.seating.seats())[0]!;
    expect(await sessions.findSeat(getDb(), r.id, { token: seat.qrToken })).toBeDefined();
    expect(await sessions.findSeat(getDb(), other.id, { token: seat.qrToken })).toBeUndefined();
  });

  it("scanning the same table QR from two phones opens one shared session", async () => {
    const seat = (await ctx.repo.seating.seats()).find((s) => s.label === "1")!;
    const s = { id: seat.id, type: seat.type, label: seat.label };
    const a = await sessions.joinSession(getDb(), r, { seat: s, deviceId: PHONE_A, source: "qr" });
    const b = await sessions.joinSession(getDb(), r, { seat: s, deviceId: PHONE_B, source: "qr" });
    expect(a.ok && b.ok && a.sessionId === b.sessionId).toBe(true);
    expect(b.ok && b.joined).toBe(true);
    const open = await getDb().select().from(tableSessions).where(and(eq(tableSessions.seatId, seat.id), eq(tableSessions.status, "open")));
    expect(open).toHaveLength(1);
  });

  it("picker: an occupied seat needs « Rejoindre »; the last phone out closes the session", async () => {
    const seat = (await ctx.repo.seating.seats()).find((s) => s.label === "2")!;
    const s = { id: seat.id, type: seat.type, label: seat.label };
    const a = await sessions.joinSession(getDb(), r, { seat: s, deviceId: PHONE_A, source: "picker" });
    expect(a.ok).toBe(true);
    expect(await sessions.joinSession(getDb(), r, { seat: s, deviceId: PHONE_B, source: "picker" })).toEqual({ ok: false, reason: "occupied" });
    const b = await sessions.joinSession(getDb(), r, { seat: s, deviceId: PHONE_B, source: "picker", confirmJoin: true });
    expect(b.ok).toBe(true);
    const id = a.ok ? a.sessionId : "";
    await sessions.leaveSession(getDb(), r.id, id, PHONE_A, "released");
    expect((await getDb().query.tableSessions.findFirst({ where: eq(tableSessions.id, id) }))!.status).toBe("open");
    await sessions.leaveSession(getDb(), r.id, id, PHONE_B, "inactive");
    const closed = (await getDb().query.tableSessions.findFirst({ where: eq(tableSessions.id, id) }))!;
    expect(closed.status).toBe("closed");
    expect(closed.closedReason).toBe("inactive");
    expect(await sessions.heartbeat(getDb(), r.id, id, PHONE_A)).toBe(false);
  });

  it("heartbeat and leave are refused from another restaurant", async () => {
    const seat = (await ctx.repo.seating.seats()).find((s) => s.label === "4")!;
    const a = await sessions.joinSession(getDb(), r, { seat: { id: seat.id, type: seat.type, label: seat.label }, deviceId: PHONE_A, source: "qr" });
    const id = a.ok ? a.sessionId : "";
    expect(await sessions.heartbeat(getDb(), other.id, id, PHONE_A)).toBe(false);
    await sessions.leaveSession(getDb(), other.id, id, PHONE_A, "released");
    expect((await getDb().query.tableSessions.findFirst({ where: eq(tableSessions.id, id) }))!.status).toBe("open");
  });

  it("abandoned picker seats and idle QR sessions are swept", async () => {
    const seat = (await ctx.repo.seating.seats()).find((s) => s.label === "5")!;
    const a = await sessions.joinSession(getDb(), r, { seat: { id: seat.id, type: seat.type, label: seat.label }, deviceId: PHONE_A, source: "picker" });
    const id = a.ok ? a.sessionId : "";
    const later = new Date(Date.now() + 10 * 60_000); // 10 minutes of silence
    expect(await sessions.sweepStale(getDb(), await reload(r.id), later)).toBeGreaterThanOrEqual(1);
    expect((await getDb().query.tableSessions.findFirst({ where: eq(tableSessions.id, id) }))!.closedReason).toBe("inactive");
    const muchLater = new Date(Date.now() + 5 * 60 * 60_000);
    await sessions.sweepStale(getDb(), await reload(r.id), muchLater);
    const stillOpen = await getDb().select().from(tableSessions).where(and(eq(tableSessions.restaurantId, r.id), eq(tableSessions.status, "open")));
    expect(stillOpen).toHaveLength(0);
  });

  it("tables free themselves: empty QR table 20 min, finished meal 1 h, forgotten orders 12 h; never a table being served", async () => {
    const db = getDb();
    const min = 60_000;
    const seatsOf = await ctx.repo.seating.seats();
    const open = async (label: string) => {
      const seat = seatsOf.find((x) => x.label === label)!;
      const j = await sessions.joinSession(db, r, { seat: { id: seat.id, type: seat.type, label: seat.label }, deviceId: PHONE_B, source: "qr" });
      return j.ok ? { sessionId: j.sessionId, seatId: seat.id } : null;
    };
    let n = 900;
    const order = (sess: { sessionId: string; seatId: string }, status: "sent" | "served" | "cancelled", at = new Date()) =>
      db.insert(orders).values({ restaurantId: r.id, sessionId: sess.sessionId, seatId: sess.seatId, businessDate: "2026-11-13", number: n++, status, validationMode: "direct", updatedAt: at, sentAt: at });
    const status = async (id: string) => (await db.query.tableSessions.findFirst({ where: eq(tableSessions.id, id) }))!;
    const sweepAt = async (offsetMs: number) => sessions.sweepStale(db, await reload(r.id), new Date(Date.now() + offsetMs));

    // 1. Scanned the table QR, never ordered: still held at 15 min, freed after 20 min.
    const empty = (await open("1"))!;
    await sweepAt(15 * min);
    expect((await status(empty.sessionId)).status).toBe("open");
    await sweepAt(21 * min);
    expect(await status(empty.sessionId)).toMatchObject({ status: "closed", closedReason: "expired" });

    // 2. Only a cancelled order counts as « nothing ordered ».
    const cancelledOnly = (await open("2"))!;
    await order(cancelledOnly, "cancelled");
    await sweepAt(21 * min);
    expect((await status(cancelledOnly.sessionId)).status).toBe("closed");

    // 3. Everything served: held during the meal, freed an hour after the last move.
    const ate = (await open("4"))!;
    await order(ate, "served");
    await sweepAt(45 * min);
    expect((await status(ate.sessionId)).status).toBe("open");
    await sweepAt(61 * min);
    expect(await status(ate.sessionId)).toMatchObject({ status: "closed", closedReason: "finished" });

    // 4. An order in progress keeps the table for hours (the kitchen is on it)…
    const serving = (await open("5"))!;
    await order(serving, "sent");
    await sweepAt(5 * 60 * min);
    expect((await status(serving.sessionId)).status).toBe("open");
    // …but a recent move on the order (staff confirmed it late) counts as activity.
    await db.update(orders).set({ updatedAt: new Date(Date.now() + 11 * 60 * min) }).where(eq(orders.sessionId, serving.sessionId));
    await sweepAt(13 * 60 * min);
    expect((await status(serving.sessionId)).status).toBe("open");
    // 12 h with nothing at all: freed anyway; the order itself is untouched for the staff.
    await sweepAt(24 * 60 * min);
    expect(await status(serving.sessionId)).toMatchObject({ status: "closed", closedReason: "stale" });
    const [kept] = await db.select({ status: orders.status }).from(orders).where(eq(orders.sessionId, serving.sessionId));
    expect(kept!.status).toBe("sent");
  });

  it("the 5-minute job sweeps every business without waiting for a customer", async () => {
    const seat = (await otherCtx.repo.seating.seats()).find((s) => s.type === "table") ?? null;
    const target = seat ?? (await admin.addSeat(otherCtx, { type: "table", label: "9", areaId: null, capacity: null }));
    const j = await sessions.joinSession(getDb(), other, { seat: { id: target.id, type: target.type, label: target.label }, deviceId: PHONE_A, source: "qr" });
    expect(j.ok).toBe(true);
    expect(await sessions.sweepAllStale(getDb(), new Date(Date.now() + 30 * 60_000))).toBeGreaterThanOrEqual(1);
    const left = await getDb().select().from(tableSessions).where(and(eq(tableSessions.restaurantId, other.id), eq(tableSessions.status, "open")));
    expect(left).toHaveLength(0);
  });

  it("the picker never exposes QR tokens, and hides printed seats in per-seat mode", async () => {
    await getDb()
      .update(restaurants)
      .set({ settings: { ...r.settings, qrStrategy: "per_seat", seatingModes: ["table", "room", "takeaway"] } })
      .where(eq(restaurants.id, r.id));
    await admin.syncSingletonSeats(getDb(), r.id, ["table", "room", "takeaway"]);
    const list = await sessions.pickerSeats(getDb(), await reload(r.id));
    expect(list.map((s) => s.type)).toEqual(["takeaway"]);
    expect(JSON.stringify(list)).not.toMatch(/qrToken|qr_token/);
    await getDb()
      .update(restaurants)
      .set({ settings: { ...r.settings, qrStrategy: "generic", seatingModes: ["table", "room", "takeaway"] } })
      .where(eq(restaurants.id, r.id));
    const generic = await sessions.pickerSeats(getDb(), await reload(r.id));
    expect(generic.some((s) => s.type === "table")).toBe(true);
    const tokens = (await getDb().select({ t: seats.qrToken }).from(seats).where(eq(seats.restaurantId, r.id))).map((x) => x.t);
    for (const tk of tokens) expect(JSON.stringify(generic)).not.toContain(tk);
  });

  it("per-seat QR: a table's seat id (returned by a scan) cannot be reused to join it without its QR", async () => {
    const { POST } = await import("@/app/api/public/sessions/route");
    await getDb()
      .update(restaurants)
      .set({ published: true, settings: { ...r.settings, qrStrategy: "per_seat", seatingModes: ["table", "room", "takeaway"] } })
      .where(eq(restaurants.id, r.id));
    const fresh = await reload(r.id);
    const seat = (await ctx.repo.seating.seats()).find((s) => s.label === "5")!;
    expect(sessions.pickable(fresh, seat)).toBe(false);
    const call = (body: object) =>
      POST(new Request("http://localhost/api/public/sessions", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.9.8.7" }, body: JSON.stringify({ slug: fresh.slug, ...body }) }));
    // The phone at the table scans its QR and learns the seat id…
    const scan = await call({ deviceId: PHONE_A, token: seat.qrToken });
    expect(scan.status).toBe(200);
    const { seat: seen } = (await scan.json()) as { seat: { id: string } };
    expect(seen.id).toBe(seat.id);
    // …but another phone (or the same one later, from home) cannot join by that id.
    const byId = await call({ deviceId: PHONE_B, seatId: seen.id, confirmJoin: true });
    expect(byId.status).toBe(404);
    // Seats the picker offers still work by id.
    const takeaway = (await sessions.pickerSeats(getDb(), fresh))[0]!;
    expect((await call({ deviceId: PHONE_B, seatId: takeaway.id })).status).toBe(200);
    // With one generic QR, every seat is picked by id.
    await getDb().update(restaurants).set({ settings: { ...fresh.settings, qrStrategy: "generic" } }).where(eq(restaurants.id, r.id));
    expect(sessions.pickable(await reload(r.id), seat)).toBe(true);
    await getDb().update(restaurants).set({ published: false }).where(eq(restaurants.id, r.id));
  });
});
