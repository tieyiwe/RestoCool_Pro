import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// Emails are built with next-intl's server translations: the same messages, outside Next.js.
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("use-intl/core");
  const messages = { fr: (await import("@/messages/fr.json")).default, en: (await import("@/messages/en.json")).default, zh: (await import("@/messages/zh.json")).default };
  return {
    getTranslations: async ({ locale, namespace }: { locale: "fr" | "en" | "zh"; namespace: string }) =>
      createTranslator({ locale, messages: messages[locale] as never, namespace: namespace as never }),
  };
});

const { closeDb, getDb } = await import("@/db");
const { openingHours, reservations, restaurants } = await import("@/db/schema");
const rv = await import("@/lib/reservations");
const { reservationEmail } = await import("@/lib/email/reservation");
const { createRestaurantForUser } = await import("@/lib/restaurants/provision");
const { ForbiddenError } = await import("@/lib/errors");

const hasDb = Boolean(process.env.DATABASE_URL);
const NOW = new Date("2026-11-13T08:00:00Z"); // Friday 08:00 in Ouagadougou
const DAY = "2026-11-14"; // Saturday
const PHONE = "phoneRESERVEAAAAAAAAA";
const base = { date: DAY, time: "19:30", partySize: 4, name: "Awa Ouédraogo", email: "Awa@Example.com", phone: "70 11 22 33", locale: "fr" as const };

describe.skipIf(!hasDb)("reservations (database)", () => {
  type R = typeof restaurants.$inferSelect;
  let r: R;
  let other: R;
  const ids: string[] = [];
  const reload = async () => (r = (await getDb().select().from(restaurants).where(eq(restaurants.id, r.id)))[0]!);
  const owner = () => ({ db: getDb(), actor: { kind: "member" as const, userId: "it-resv-owner", restaurantId: r.id, role: "owner" as const }, restaurantId: r.id });
  const setCfg = async (cfg: Partial<import("@/lib/reservations").ReservationConfig>) => {
    await getDb()
      .update(restaurants)
      .set({ settings: { ...r.settings, reservations: { ...rv.RESERVATION_DEFAULTS, ...r.settings.reservations, ...cfg } } })
      .where(eq(restaurants.id, r.id));
    await reload();
  };

  beforeAll(async () => {
    r = await createRestaurantForUser(getDb(), { clerkUserId: "it-resv-owner" }, { name: "Maquis Réserve", city: "Ouagadougou" });
    other = await createRestaurantForUser(getDb(), { clerkUserId: "it-resv-other" }, { name: "Maquis Réserve Voisin", city: "Ouagadougou" });
    ids.push(r.id, other.id);
    await getDb().delete(openingHours).where(eq(openingHours.restaurantId, r.id));
  });
  afterAll(async () => {
    await getDb().delete(restaurants).where(inArray(restaurants.id, ids));
    await closeDb();
  });

  it("is off until the business turns it on", async () => {
    expect(rv.reservationsOpen(r)).toBe(false);
    await expect(rv.createReservation(getDb(), r, rv.ReservationInput.parse(base), PHONE, NOW)).rejects.toMatchObject({ code: "closed" });
    await setCfg({ enabled: true });
    expect(rv.reservationsOpen(r)).toBe(true);
  });

  it("offers times from the opening hours, an hour before closing, after the notice", async () => {
    const db = getDb();
    // No hours at all: 11:00–22:00, last slot 21:00.
    let slots = await rv.slotsFor(db, r, DAY, NOW);
    expect(slots[0]?.time).toBe("11:00");
    expect(slots.at(-1)?.time).toBe("21:00");
    // Saturday 18:00–23:30 only; Sunday closed.
    await db.insert(openingHours).values({ restaurantId: r.id, weekday: 6, opens: "18:00", closes: "23:30" });
    slots = await rv.slotsFor(db, r, DAY, NOW);
    expect(slots.map((s) => s.time)).toEqual(["18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00", "22:30"]);
    expect(await rv.slotsFor(db, r, "2026-11-15", NOW)).toEqual([]);
    // Today: nothing before now + 60 min notice; past days and beyond daysAhead: nothing.
    expect(await rv.slotsFor(db, r, "2026-11-12", NOW)).toEqual([]);
    expect(await rv.slotsFor(db, r, "2027-06-01", NOW)).toEqual([]);
  });

  it("books, emails-ready, dedupes, respects party size and covers, and stays in its business", async () => {
    const db = getDb();
    const input = rv.ReservationInput.parse(base);
    expect(input.email).toBe("awa@example.com");
    expect(input.phone).toBe("22670112233");
    const a = await rv.createReservation(db, r, input, PHONE, NOW);
    expect(a.duplicate).toBe(false);
    expect(a.reservation).toMatchObject({ status: "requested", partySize: 4, ref: expect.stringMatching(/^R-[A-Z2-9]{5}$/) });
    // Same request again: the same reservation, no second one.
    const again = await rv.createReservation(db, r, input, PHONE, NOW);
    expect(again).toMatchObject({ duplicate: true, reservation: { id: a.reservation.id } });
    // The private link finds it; a wrong one does not.
    const token = rv.reservationToken(a.reservation.id);
    expect((await rv.reservationByToken(db, token))?.id).toBe(a.reservation.id);
    expect(await rv.reservationByToken(db, "x".repeat(32))).toBeNull();
    // Rules: party size, unknown time, covers per slot.
    await setCfg({ maxParty: 6, maxCoversPerSlot: 8 });
    await expect(rv.createReservation(db, r, rv.ReservationInput.parse({ ...base, partySize: 7, email: "b@x.bf" }), PHONE, NOW)).rejects.toMatchObject({ code: "party" });
    await expect(rv.createReservation(db, r, rv.ReservationInput.parse({ ...base, time: "17:00", email: "b@x.bf" }), PHONE, NOW)).rejects.toMatchObject({ code: "slot" });
    await expect(rv.createReservation(db, r, rv.ReservationInput.parse({ ...base, partySize: 5, email: "b@x.bf" }), PHONE, NOW)).rejects.toMatchObject({ code: "full" });
    expect((await rv.slotsFor(db, r, DAY, NOW)).find((s) => s.time === "19:30")?.left).toBe(4);
    // Phone numbers that are not phone numbers are refused.
    expect(rv.ReservationInput.safeParse({ ...base, phone: "12" }).success).toBe(false);

    // Another business sees nothing of it.
    const foreign = { db, actor: { kind: "member" as const, userId: "it-resv-other", restaurantId: other.id, role: "owner" as const }, restaurantId: other.id };
    expect((await rv.businessReservations(foreign, DAY, DAY)).list).toEqual([]);
    await expect(rv.moveReservation(foreign, a.reservation.id, "confirm")).rejects.toThrow();
    // Someone without the reservations access cannot act.
    const kitchen = { db, actor: { kind: "member" as const, userId: "k", restaurantId: r.id, role: "kitchen" as const }, restaurantId: r.id };
    await expect(rv.businessReservations(kitchen, DAY, DAY)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("the business calls, confirms, seats and finishes; the customer can cancel; the emails say it", async () => {
    const db = getDb();
    const own = owner();
    const { list, waiting } = await rv.businessReservations(own, "2026-11-13", "2026-12-31");
    expect(waiting).toHaveLength(1);
    expect(await rv.pendingReservations(db, r.id, NOW)).toBe(1);
    const id = list[0]!.id;
    await rv.markContacted(own, id);
    const confirmed = await rv.moveReservation(own, id, "confirm");
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.contactedAt).not.toBeNull();
    // A move that does not fit (confirm twice) is refused.
    await expect(rv.moveReservation(own, id, "confirm")).rejects.toMatchObject({ code: "transition" });
    const mail = await reservationEmail("confirmed", confirmed, { name: r.name, slug: r.slug, address: null, city: "Ouagadougou", phone: "+226 70 00 00 00" }, "https://restocool.com");
    expect(mail.subject).toContain("Maquis Réserve");
    expect(mail.html).toContain(`https://restocool.com/reservation/${rv.reservationToken(id)}`);
    expect(mail.html).toContain("19:30");
    expect(mail.text).toContain("samedi 14 novembre 2026");

    // The customer cancels from the link; then nothing else can move it.
    const cancelled = await rv.cancelByCustomer(db, rv.reservationToken(id));
    expect(cancelled).toMatchObject({ status: "cancelled", cancelledBy: "customer" });
    await expect(rv.cancelByCustomer(db, rv.reservationToken(id))).rejects.toMatchObject({ code: "transition" });

    // A new one goes the whole way.
    const b = await rv.createReservation(db, r, rv.ReservationInput.parse({ ...base, time: "20:00", partySize: 2, email: "c@x.bf" }), PHONE, NOW);
    await rv.moveReservation(own, b.reservation.id, "seat");
    expect((await rv.moveReservation(own, b.reservation.id, "complete")).status).toBe("completed");
    const [row] = await db.select().from(reservations).where(eq(reservations.id, b.reservation.id));
    expect(row!.statusBy).toBe("it-resv-owner");
  });
});
