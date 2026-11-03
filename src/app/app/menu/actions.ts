"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { requireMember } from "@/lib/auth/context";
import type { Action } from "@/lib/auth/can";
import { AppError, PlanLimitError } from "@/lib/errors";
import { log } from "@/lib/log";
import { CategoryInput, ItemInput } from "@/lib/menu/schemas";
import * as menu from "@/lib/menu/service";

async function ctx(action: Action) {
  const { actor, repo } = await requireMember(action);
  return { db: getDb(), actor, repo };
}

function done() {
  revalidatePath("/app/menu");
}

const Id = z.uuid();
const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

function categoryFromForm(fd: FormData): CategoryInput {
  const from = str(fd.get("from"));
  const to = str(fd.get("to"));
  return CategoryInput.parse({
    name: { fr: str(fd.get("name_fr")), en: str(fd.get("name_en")), zh: str(fd.get("name_zh")) },
    active: fd.get("active") !== null ? fd.get("active") === "on" : true,
    timeWindow: from && to ? { from, to } : null,
  });
}

export async function createCategoryAction(fd: FormData) {
  await menu.createCategory(await ctx("menu.write"), categoryFromForm(fd));
  done();
}

export async function updateCategoryAction(fd: FormData) {
  await menu.updateCategory(await ctx("menu.write"), Id.parse(fd.get("id")), categoryFromForm(fd));
  done();
}

export async function moveCategoryAction(fd: FormData) {
  await menu.moveCategory(await ctx("menu.write"), Id.parse(fd.get("id")), fd.get("dir") === "up" ? "up" : "down");
  done();
}

export async function deleteCategoryAction(fd: FormData) {
  const res = await menu.deleteCategory(await ctx("menu.write"), Id.parse(fd.get("id")));
  done();
  if (res === "not_empty") redirect("/app/menu?error=category_not_empty");
}

export async function moveItemAction(fd: FormData) {
  await menu.moveItem(await ctx("menu.write"), Id.parse(fd.get("id")), fd.get("dir") === "up" ? "up" : "down");
  done();
}

export async function duplicateItemAction(fd: FormData) {
  try {
    await menu.duplicateItem(await ctx("menu.write"), Id.parse(fd.get("id")));
  } catch (err) {
    if (err instanceof PlanLimitError) redirect("/app/menu?error=plan_limit");
    throw err;
  }
  done();
}

export async function deleteItemAction(fd: FormData) {
  await menu.deleteItem(await ctx("menu.write"), Id.parse(fd.get("id")));
  done();
}

/** Kitchen and servers may also do this (menu.soldOut). */
export async function soldOutAction(fd: FormData) {
  await menu.setSoldOutToday(await ctx("menu.soldOut"), Id.parse(fd.get("id")), fd.get("soldOut") === "1");
  done();
}

export async function availableAction(fd: FormData) {
  await menu.setItemAvailable(await ctx("menu.write"), Id.parse(fd.get("id")), fd.get("available") === "1");
  done();
}

export type SaveItemResult = { ok: true } | { ok: false; error: "invalid" | "plan_limit" | "not_found" | "unknown" };

/** Create (itemId undefined) or update an item from the item form. */
export async function saveItemAction(itemId: string | undefined, values: unknown): Promise<SaveItemResult> {
  const parsed = ItemInput.safeParse(values);
  if (!parsed.success) return { ok: false, error: "invalid" };
  try {
    const c = await ctx("menu.write");
    if (itemId) await menu.updateItem(c, Id.parse(itemId), parsed.data);
    else await menu.createItem(c, parsed.data);
  } catch (err) {
    if (err instanceof PlanLimitError) return { ok: false, error: "plan_limit" };
    if (err instanceof AppError && err.status === 404) return { ok: false, error: "not_found" };
    log.error("save_item_failed", { err });
    return { ok: false, error: "unknown" };
  }
  done();
  return { ok: true };
}
