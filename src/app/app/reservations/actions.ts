"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { restaurants } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { requireMember } from "@/lib/auth/context";
import { sendReservationEmail, type ReservationMailKind } from "@/lib/email/reservation";
import { NotFoundError } from "@/lib/errors";
import { CheckinError, checkInByQr, markContacted, moveReservation, RESERVATION_ACTIONS, ReservationError, ReservationSettingsInput, WaitInput } from "@/lib/reservations";
import { getMemberContext } from "@/lib/auth/context";
import { publicBaseUrl } from "@/lib/urls";
import { notify } from "@/lib/realtime/events";

const back = (day: string | null, q: string) => `/app/reservations?${day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `day=${day}&` : ""}${q}`;

const Move = z.object({ id: z.uuid(), action: z.enum(RESERVATION_ACTIONS), reason: z.string().trim().max(300).optional() });
/** Emails the customer gets when the business answers (seating, finishing and no-shows send nothing). */
const MAIL: Partial<Record<(typeof RESERVATION_ACTIONS)[number], ReservationMailKind>> = { confirm: "confirmed", decline: "declined", cancel: "cancelled" };

/** Confirm, decline, seat, finish, no-show or cancel one reservation. */
export async function moveReservationAction(fd: FormData) {
  const day = (fd.get("day") as string | null) ?? null;
  const p = Move.parse({ id: fd.get("id"), action: fd.get("action"), reason: fd.get("reason") || undefined });
  const m = await requireMember("reservations.write");
  let ok = p.action as string;
  try {
    const r = await moveReservation({ db: getDb(), actor: m.actor, restaurantId: m.repo.restaurantId }, p.id, p.action, p.reason);
    const kind = MAIL[p.action];
    if (kind) await sendReservationEmail(getDb(), kind, r, await publicBaseUrl());
  } catch (err) {
    if (err instanceof ReservationError) ok = "";
    else if (err instanceof NotFoundError) ok = "";
    else throw err;
  }
  revalidatePath("/app/reservations");
  redirect(back(day, ok ? `ok=${ok}` : "error=moved"));
}

/** « J'ai appelé » : the business phoned the customer. */
export async function contactedAction(fd: FormData) {
  const day = (fd.get("day") as string | null) ?? null;
  const id = z.uuid().parse(fd.get("id"));
  const m = await requireMember("reservations.write");
  await markContacted({ db: getDb(), actor: m.actor, restaurantId: m.repo.restaurantId }, id);
  revalidatePath("/app/reservations");
  redirect(back(day, "ok=contacted"));
}

/** Reservations on or off, and their rules (owner / managers). */
export async function reservationSettingsAction(fd: FormData) {
  const m = await requireMember("settings.write");
  const p = ReservationSettingsInput.safeParse({
    enabled: fd.get("enabled") === "on",
    slotMinutes: fd.get("slotMinutes"),
    maxParty: fd.get("maxParty"),
    maxCoversPerSlot: fd.get("maxCoversPerSlot") || 0,
    noticeMinutes: fd.get("noticeMinutes"),
    daysAhead: fd.get("daysAhead"),
    note: (fd.get("note") as string | null) || undefined,
    expiryMinutes: fd.get("expiryMinutes") ?? 60,
  });
  if (!p.success) redirect("/app/reservations?error=settings#settings");
  const r = await m.repo.restaurant.get();
  if (!r) throw new NotFoundError();
  const was = r.settings.reservations?.enabled ?? false;
  await getDb()
    .update(restaurants)
    .set({ settings: { ...r.settings, reservations: p.data }, updatedAt: new Date() })
    .where(eq(restaurants.id, r.id));
  await writeAudit(getDb(), m.actor, {
    restaurantId: r.id,
    action: was !== p.data.enabled ? (p.data.enabled ? "reservations.enabled" : "reservations.disabled") : "reservations.settings",
    entity: "restaurant",
    entityId: r.id,
  });
  revalidatePath("/app/reservations");
  revalidatePath(`/r/${r.slug}`);
  redirect(`/app/reservations?ok=${was !== p.data.enabled ? (p.data.enabled ? "enabled" : "disabled") : "saved"}`);
}

/** A scanned guest QR: check them in (once). Staff who serve tables may do it. */
export async function checkInAction(fd: FormData) {
  const token = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/).parse(fd.get("token"));
  const ctx = await getMemberContext();
  if (!ctx) redirect(`/rv/${token}`);
  const r = await ctx.repo.restaurant.get();
  if (!r) throw new NotFoundError();
  let result = "ok";
  try {
    await checkInByQr({ db: getDb(), actor: ctx.actor, restaurantId: r.id }, r, token);
  } catch (err) {
    if (err instanceof CheckinError) result = err.code;
    else throw err;
  }
  revalidatePath("/app/reservations");
  redirect(`/app/reservations/checkin/${token}?result=${result}`);
}

/** « Temps d'attente » on a busy day: shown on the public page and the reservation form. */
export async function waitTimeAction(fd: FormData) {
  const m = await requireMember("reservations.write");
  const p = WaitInput.safeParse({ minutes: fd.get("minutes"), hours: fd.get("hours") ?? 3, note: (fd.get("note") as string | null) || undefined });
  if (!p.success) redirect("/app/reservations?error=settings");
  const r = await m.repo.restaurant.get();
  if (!r) throw new NotFoundError();
  const now = new Date();
  const waitTime = p.data.minutes > 0 ? { minutes: p.data.minutes, note: p.data.note, setAt: now.toISOString(), until: new Date(now.getTime() + p.data.hours * 3_600_000).toISOString(), setBy: m.actor.kind === "member" ? m.actor.userId : undefined } : undefined;
  await getDb()
    .update(restaurants)
    .set({ settings: { ...r.settings, waitTime }, updatedAt: now })
    .where(eq(restaurants.id, r.id));
  await writeAudit(getDb(), m.actor, { restaurantId: r.id, action: waitTime ? "wait.set" : "wait.cleared", entity: "restaurant", entityId: r.id, data: waitTime ? { minutes: waitTime.minutes } : undefined });
  // Customers on the page see it change (the menu event makes their page re-read it).
  await notify(getDb(), { k: "menu", r: r.id });
  revalidatePath("/app/reservations");
  revalidatePath(`/r/${r.slug}`);
  redirect(`/app/reservations?ok=${waitTime ? "wait" : "waitCleared"}`);
}
