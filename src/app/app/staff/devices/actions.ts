"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { requireMember } from "@/lib/auth/context";
import { authorizeDevice, DEVICE_COOKIE, revokeDevice, STAFF_COOKIE, type DeviceCtx } from "@/lib/devices";
import { AppError } from "@/lib/errors";

async function ctx(): Promise<DeviceCtx & { memberId: string | null }> {
  const m = await requireMember("devices.write");
  return { db: getDb(), actor: m.actor, restaurantId: m.repo.restaurantId, memberId: m.actor.memberId ?? null };
}

const BACK = "/app/staff/devices";

async function run(fn: () => Promise<string>) {
  let to: string;
  try {
    to = `${BACK}?ok=${await fn()}`;
  } catch (err) {
    if (err instanceof z.ZodError) to = `${BACK}?error=invalid`;
    else if (err instanceof AppError && err.status === 403) to = `${BACK}?error=forbidden`;
    else if (err instanceof AppError && err.status === 402) to = `${BACK}?error=plan`;
    else if (err instanceof AppError && err.status === 404) to = `${BACK}?error=notFound`;
    else throw err;
  }
  revalidatePath(BACK);
  redirect(to);
}

/** « Autoriser cet appareil »: this browser becomes a device of the business (long-lived cookie). */
export async function authorizeDeviceAction(fd: FormData) {
  await run(async () => {
    const c = await ctx();
    const { token } = await authorizeDevice(c, String(fd.get("name") ?? ""), c.memberId);
    const jar = await cookies();
    jar.set(DEVICE_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 400 * 86_400 });
    jar.delete(STAFF_COOKIE);
    return "authorized";
  });
}

export async function revokeDeviceAction(fd: FormData) {
  await run(async () => {
    await revokeDevice(await ctx(), z.uuid().parse(String(fd.get("id") ?? "")));
    return "revoked";
  });
}
