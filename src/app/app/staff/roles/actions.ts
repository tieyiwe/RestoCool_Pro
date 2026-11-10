"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { requireMember } from "@/lib/auth/context";
import { AppError } from "@/lib/errors";
import type { PersonnelCtx } from "@/lib/personnel/attendance";
import { RoleError, assignJobRole, createJobRole, deleteJobRole, updateJobRoleAccess } from "@/lib/personnel/roles";

async function ctx(): Promise<PersonnelCtx> {
  const m = await requireMember("staff.write");
  return { db: getDb(), actor: m.actor, repo: m.repo };
}

/** Run, then come back with a message (works without JavaScript). */
async function run(back: string, fn: (c: PersonnelCtx) => Promise<string>) {
  let to: string;
  try {
    to = `${back}?ok=${await fn(await ctx())}`;
  } catch (err) {
    if (err instanceof z.ZodError) to = `${back}?error=invalid`;
    else if (err instanceof RoleError) to = `${back}?error=${err.code}`;
    else if (err instanceof AppError && err.status === 403) to = `${back}?error=forbidden`;
    else if (err instanceof AppError && err.status === 404) to = `${back}?error=notFound`;
    else throw err;
  }
  revalidatePath("/app/staff");
  revalidatePath("/app/staff/roles");
  redirect(to);
}

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const Id = z.uuid();

export async function createRoleAction(fd: FormData) {
  await run("/app/staff/roles", async (c) => {
    await createJobRole(c, { name: s(fd, "name"), group: s(fd, "group") as "front", access: fd.getAll("access").map(String) as never });
    return "created";
  });
}

export async function saveRoleAccessAction(fd: FormData) {
  await run("/app/staff/roles", async (c) => {
    await updateJobRoleAccess(c, Id.parse(s(fd, "id")), fd.getAll("access").map(String));
    return "saved";
  });
}

export async function deleteRoleAction(fd: FormData) {
  await run("/app/staff/roles", async (c) => {
    await deleteJobRole(c, Id.parse(s(fd, "id")));
    return "deleted";
  });
}

export async function assignRoleAction(fd: FormData) {
  await run("/app/staff", async (c) => {
    await assignJobRole(c, Id.parse(s(fd, "id")), Id.parse(s(fd, "roleId")));
    return "role";
  });
}
