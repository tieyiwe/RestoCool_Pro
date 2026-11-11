"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { requireMember } from "@/lib/auth/context";
import { AppError } from "@/lib/errors";
import type { SeatingCtx } from "@/lib/seating/admin";
import { BusError, createBus, deleteBus, renameBus, updateBusLayout } from "@/lib/transport/buses";
import { createRoute, deleteRoute, RouteError, setRouteAssignments } from "@/lib/transport/routes";

async function ctx(action: "seats.write" | "staff.write" = "seats.write"): Promise<SeatingCtx> {
  const m = await requireMember(action);
  return { db: getDb(), actor: m.actor, repo: m.repo };
}

/** Run, then come back with a message (works without JavaScript); `anchor` scrolls to the section. */
async function run(back: string, fn: () => Promise<string>, anchor = "") {
  let to: string;
  try {
    to = `${back}?ok=${await fn()}`;
  } catch (err) {
    if (err instanceof BusError || err instanceof RouteError) to = `${back}?error=${err.code}`;
    else if (err instanceof z.ZodError) to = `${back}?error=invalid`;
    else if (err instanceof AppError && err.status === 403) to = `${back}?error=forbidden`;
    else if (err instanceof AppError && err.status === 404) to = `${back}?error=notFound`;
    else throw err;
  }
  revalidatePath("/app/buses");
  redirect(to + anchor);
}

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const layoutOf = (fd: FormData) => ({
  rows: s(fd, "rows"),
  left: s(fd, "left"),
  right: s(fd, "right"),
  back: s(fd, "back") || 0,
  doorRow: fd.get("doorRow") ? s(fd, "doorRow") : null,
  doorSide: s(fd, "doorSide") || "right",
});

export async function createBusAction(fd: FormData) {
  // From the setup wizard the form comes back to the wizard step.
  const back = s(fd, "back_to").startsWith("/app/") ? s(fd, "back_to") : "/app/buses";
  await run(back, async () => {
    const r = await createBus(await ctx(), { name: s(fd, "name"), layout: layoutOf(fd) as never });
    return `busCreated&n=${r.seats}`;
  });
}
export async function updateBusLayoutAction(fd: FormData) {
  await run("/app/buses", async () => `busUpdated&n=${await updateBusLayout(await ctx(), z.uuid().parse(s(fd, "id")), layoutOf(fd))}`);
}
export async function renameBusAction(fd: FormData) {
  await run("/app/buses", async () => {
    await renameBus(await ctx(), z.uuid().parse(s(fd, "id")), s(fd, "name"));
    return "busRenamed";
  });
}
export async function deleteBusAction(fd: FormData) {
  await run("/app/buses", async () => {
    await deleteBus(await ctx(), z.uuid().parse(s(fd, "id")));
    return "busDeleted";
  });
}
export async function createRouteAction(fd: FormData) {
  await run(
    "/app/buses",
    async () => {
      await createRoute(await ctx(), { origin: s(fd, "origin"), destination: s(fd, "destination") });
      return "routeCreated";
    },
    "#routes",
  );
}
export async function deleteRouteAction(fd: FormData) {
  await run(
    "/app/buses",
    async () => {
      await deleteRoute(await ctx(), z.uuid().parse(s(fd, "id")));
      return "routeDeleted";
    },
    "#routes",
  );
}
export async function assignRouteAction(fd: FormData) {
  await run(
    "/app/buses",
    async () => {
      await setRouteAssignments(await ctx("staff.write"), z.uuid().parse(s(fd, "id")), fd.getAll("member").map(String));
      return "routeAssigned";
    },
    "#routes",
  );
}
