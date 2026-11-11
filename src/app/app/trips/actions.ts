"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { requireMember } from "@/lib/auth/context";
import { AppError } from "@/lib/errors";
import { endTrip, startTrip, TripError } from "@/lib/transport/trips";

async function ctx() {
  const m = await requireMember("orders.confirm");
  return { db: getDb(), actor: m.actor, repo: m.repo };
}

async function run(fn: () => Promise<string>) {
  let to: string;
  try {
    to = `/app/trips?ok=${await fn()}`;
  } catch (err) {
    if (err instanceof TripError) to = `/app/trips?error=${err.code}`;
    else if (err instanceof AppError && err.status === 403) to = "/app/trips?error=forbidden";
    else if (err instanceof AppError && err.status === 404) to = "/app/trips?error=notFound";
    else throw err;
  }
  revalidatePath("/app/trips");
  redirect(to);
}

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function startTripAction(fd: FormData) {
  await run(async () => {
    await startTrip(await ctx(), { busId: s(fd, "busId"), routeId: s(fd, "routeId"), departure: s(fd, "departure") || undefined });
    return "started";
  });
}
export async function endTripAction(fd: FormData) {
  await run(async () => {
    await endTrip(await ctx(), z.uuid().parse(s(fd, "id")));
    return "ended";
  });
}
