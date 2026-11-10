"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { requireMember } from "@/lib/auth/context";
import { AppError } from "@/lib/errors";
import { addPerson, managerPunch, regenerateAttendanceToken, setActive, setPin, type PersonnelCtx } from "@/lib/personnel/attendance";

async function ctx(): Promise<PersonnelCtx> {
  const m = await requireMember("staff.write");
  return { db: getDb(), actor: m.actor, repo: m.repo };
}

/** Run, then come back to the Personnel page with a message (works without JavaScript). */
async function run(fn: (c: PersonnelCtx) => Promise<string>) {
  let to: string;
  try {
    to = `/app/staff?ok=${await fn(await ctx())}`;
  } catch (err) {
    if (err instanceof z.ZodError) to = "/app/staff?error=invalid";
    else if (err instanceof AppError && err.status === 403) to = "/app/staff?error=forbidden";
    else if (err instanceof AppError && err.status === 404) to = "/app/staff?error=notFound";
    else throw err;
  }
  revalidatePath("/app/staff");
  redirect(to);
}

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const Id = z.uuid();

export async function addPersonAction(fd: FormData) {
  await run(async (c) => {
    const r = await addPerson(c, { name: s(fd, "name"), role: s(fd, "role") as "server", pin: s(fd, "pin") });
    return `added&no=${r.staffNo}`;
  });
}
export async function setPinAction(fd: FormData) {
  await run(async (c) => {
    await setPin(c, Id.parse(s(fd, "id")), s(fd, "pin"));
    return "pin";
  });
}
export async function punchPersonAction(fd: FormData) {
  await run(async (c) => {
    const action = s(fd, "action") === "out" ? "out" : "in";
    await managerPunch(c, Id.parse(s(fd, "id")), action);
    return action;
  });
}
export async function setActivePersonAction(fd: FormData) {
  await run(async (c) => {
    await setActive(c, Id.parse(s(fd, "id")), s(fd, "active") === "1");
    return "status";
  });
}
export async function regenerateQrAction() {
  await run(async (c) => {
    await regenerateAttendanceToken(c);
    return "qr";
  });
}
