"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { requireMember } from "@/lib/auth/context";
import { NotFoundError } from "@/lib/errors";
import { log } from "@/lib/log";
import * as seating from "@/lib/seating/admin";
import { parseSkip } from "@/lib/seating/tables";

async function ctx() {
  const { actor, repo } = await requireMember("seats.write");
  return { db: getDb(), actor, repo };
}
const s = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");
const optInt = (v: string) => (v.trim() ? Math.round(Number(v)) : null);
const Id = z.uuid();

/** Runs a seating change, then reloads the page with ?ok= or ?error= for the banner. */
async function run(fn: (c: Awaited<ReturnType<typeof ctx>>) => Promise<string | void>) {
  let target = "/app/seating";
  try {
    const msg = await fn(await ctx());
    if (msg) target += `?ok=${encodeURIComponent(msg)}`;
  } catch (err) {
    const code = err instanceof seating.SeatingError ? err.code : err instanceof z.ZodError ? "invalid" : err instanceof NotFoundError ? "invalid" : "unknown";
    if (code === "unknown") log.error("seating_action_failed", { err });
    target += `?error=${code}`;
  }
  revalidatePath("/app/seating");
  redirect(target);
}

export async function createAreaAction(fd: FormData) {
  await run((c) => seating.createArea(c, { fr: s(fd, "fr"), en: s(fd, "en"), zh: s(fd, "zh") }).then(() => undefined));
}
export async function renameAreaAction(fd: FormData) {
  await run((c) => seating.renameArea(c, Id.parse(fd.get("id")), { fr: s(fd, "fr"), en: s(fd, "en"), zh: s(fd, "zh") }));
}
export async function deleteAreaAction(fd: FormData) {
  await run((c) => seating.deleteArea(c, Id.parse(fd.get("id"))));
}
export async function addTablesAction(fd: FormData) {
  await run(async (c) => {
    const r = await seating.addTables(c, {
      from: Number(s(fd, "from")),
      to: Number(s(fd, "to")),
      skip: parseSkip(s(fd, "skip")),
      areaId: s(fd, "areaId") || null,
      capacity: optInt(s(fd, "capacity")),
    });
    return `tables:${r.added}:${r.existing}`;
  });
}
export async function addSeatAction(fd: FormData) {
  await run((c) =>
    seating
      .addSeat(c, { type: s(fd, "type") as never, label: s(fd, "label"), areaId: s(fd, "areaId") || null, capacity: optInt(s(fd, "capacity")) })
      .then(() => undefined),
  );
}
export async function updateSeatAction(fd: FormData) {
  await run((c) =>
    seating.updateSeat(c, Id.parse(fd.get("id")), {
      label: s(fd, "label"),
      areaId: s(fd, "areaId") || null,
      capacity: optInt(s(fd, "capacity")),
      active: fd.get("active") === "on",
    }),
  );
}
export async function deleteSeatAction(fd: FormData) {
  await run((c) => seating.deleteSeat(c, Id.parse(fd.get("id"))));
}
export async function regenerateSeatAction(fd: FormData) {
  await run(async (c) => {
    await seating.regenerateToken(c, Id.parse(fd.get("id")));
    return "regenerated";
  });
}
export async function moveSeatAction(fd: FormData) {
  await run((c) => seating.moveSeat(c, Id.parse(fd.get("id")), fd.get("dir") === "up" ? "up" : "down"));
}
export async function closeSessionAction(fd: FormData) {
  await run((c) => seating.closeSessionByStaff(c, Id.parse(fd.get("id"))));
}
