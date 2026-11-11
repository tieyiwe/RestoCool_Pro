"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { serviceCtx } from "@/lib/orders/staff-api";
import { OrderError, setOrderStatus } from "@/lib/orders/service";
import { moveTripOrders } from "@/lib/transport/rounds";

const Id = z.uuid();
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Confirm the round's orders (ids), or every order waiting on this trip. */
export async function confirmTripOrdersAction(fd: FormData) {
  const trip = Id.parse(s(fd, "trip"));
  const ids = s(fd, "ids").split(",").filter((x) => Id.safeParse(x).success);
  const n = await moveTripOrders(await serviceCtx("orders.confirm"), trip, "confirmed", ids.length ? ids : undefined);
  revalidatePath(`/app/trips/${trip}`);
  redirect(`/app/trips/${trip}?ok=confirmed&n=${n}`);
}

export async function serveAllAction(fd: FormData) {
  const trip = Id.parse(s(fd, "trip"));
  const n = await moveTripOrders(await serviceCtx("orders.serve"), trip, "served");
  revalidatePath(`/app/trips/${trip}`);
  redirect(`/app/trips/${trip}?ok=served&n=${n}`);
}

/** One order: confirm or mark served. */
export async function moveOrderAction(fd: FormData) {
  const trip = Id.parse(s(fd, "trip"));
  const to = s(fd, "to") === "served" ? "served" : "confirmed";
  try {
    await setOrderStatus(await serviceCtx(to === "served" ? "orders.serve" : "orders.confirm"), Id.parse(s(fd, "id")), to);
  } catch (err) {
    if (!(err instanceof OrderError && err.code === "conflict")) throw err;
  }
  revalidatePath(`/app/trips/${trip}`);
  redirect(`/app/trips/${trip}#o-${s(fd, "id")}`);
}
