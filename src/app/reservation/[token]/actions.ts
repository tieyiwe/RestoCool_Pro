"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { sendReservationEmail } from "@/lib/email/reservation";
import { NotFoundError } from "@/lib/errors";
import { cancelByCustomer, ReservationError } from "@/lib/reservations";
import { publicBaseUrl } from "@/lib/urls";

/** The customer cancels from their private link; RestoCool confirms it by email. */
export async function cancelReservationAction(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  try {
    const r = await cancelByCustomer(getDb(), token);
    await sendReservationEmail(getDb(), "cancelledByCustomer", r, await publicBaseUrl());
  } catch (err) {
    if (!(err instanceof ReservationError) && !(err instanceof NotFoundError)) throw err;
  }
  redirect(`/reservation/${encodeURIComponent(token)}?done=1`);
}
