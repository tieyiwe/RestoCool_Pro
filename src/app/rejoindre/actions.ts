"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { JoinRequestError, restaurantByJoinToken, submitJoinRequest, type JoinError } from "@/lib/personnel/join";
import { ipFromHeaders, rateLimit } from "@/lib/rate-limit";
import { JOIN_COOKIE } from "./cookie";

export type JoinState = undefined | { error: JoinError | "too_many" | "pin_mismatch" };

/** The person sends their name, phone and PIN; their phone then follows the owner's answer. */
export async function joinAction(_prev: JoinState, fd: FormData): Promise<JoinState> {
  const ip = ipFromHeaders(await headers());
  if (!rateLimit(`join:${ip}`, { capacity: 5, refillPerSec: 1 / 120 })) return { error: "too_many" };
  const s = (k: string) => String(fd.get(k) ?? "");
  if (s("pin") !== s("pin2")) return { error: "pin_mismatch" };
  const db = getDb();
  const r = await restaurantByJoinToken(db, s("token"));
  if (!r) return { error: "closed" };
  let res: { id: string; secret: string };
  try {
    res = await submitJoinRequest(db, r, { name: s("name"), phone: s("phone"), pin: s("pin") });
  } catch (err) {
    if (err instanceof JoinRequestError) return { error: err.code };
    throw err;
  }
  (await cookies()).set(JOIN_COOKIE, `${res.id}.${res.secret}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/rejoindre", maxAge: 30 * 86_400 });
  redirect("/rejoindre/statut");
}
