"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { findBusinessByRc, resetPin, setRecoveryOwnerEmail, unlockPin, unlockSignIn, verifyCaller } from "@/lib/admin/recovery";
import { requireSuperadmin } from "@/lib/auth/context";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const Id = z.uuid();

export async function findByRcAction(fd: FormData) {
  await requireSuperadmin("recovery");
  const id = await findBusinessByRc(getDb(), s(fd, "rc"));
  redirect(id ? `/admin_pro/recovery?business=${id}` : "/admin_pro/recovery?error=noMatch");
}

export async function verifyAction(fd: FormData) {
  const actor = await requireSuperadmin("recovery");
  const business = Id.parse(s(fd, "business"));
  const request = s(fd, "request") ? Id.parse(s(fd, "request")) : null;
  let caseId: string;
  try {
    caseId = (
      await verifyCaller(
        getDb(),
        actor,
        business,
        {
          callerName: s(fd, "callerName"),
          callerPhone: s(fd, "callerPhone") || undefined,
          rc: s(fd, "rc"),
          businessName: s(fd, "businessName") || undefined,
          city: s(fd, "city") || undefined,
          phone: s(fd, "phone") || undefined,
          owner: s(fd, "owner") || undefined,
          callback: s(fd, "callback") === "on",
          note: s(fd, "note") || undefined,
        },
        request,
      )
    ).id;
  } catch (err) {
    if (err instanceof z.ZodError) redirect(`/admin_pro/recovery?business=${business}&error=invalid`);
    throw err;
  }
  redirect(`/admin_pro/recovery?business=${business}&case=${caseId}`);
}

export type RecoveryState = { ok?: string; pin?: string; who?: string; error?: string } | undefined;

/** One action on a verified case. Returns the new PIN once (never stored in clear, never in a URL). */
export async function recoveryAction(_prev: RecoveryState, fd: FormData): Promise<RecoveryState> {
  const actor = await requireSuperadmin("recovery");
  const db = getDb();
  const caseId = Id.parse(s(fd, "case"));
  const what = s(fd, "what");
  try {
    if (what === "unlock") {
      await unlockPin(db, actor, caseId, Id.parse(s(fd, "member")));
      return { ok: "unlocked", who: s(fd, "name") };
    }
    if (what === "reset") {
      const pin = await resetPin(db, actor, caseId, Id.parse(s(fd, "member")));
      return { ok: "reset", pin, who: s(fd, "name") };
    }
    if (what === "signin") {
      const r = await unlockSignIn(db, actor, caseId, Id.parse(s(fd, "member")));
      return r === "done" ? { ok: "signin", who: s(fd, "name") } : { error: "signinUnavailable" };
    }
    if (what === "owner") {
      await setRecoveryOwnerEmail(db, actor, caseId, s(fd, "email"));
      return { ok: "owner", who: s(fd, "email") };
    }
    return { error: "invalid" };
  } catch (err) {
    if (err instanceof ForbiddenError) return { error: "expired" };
    if (err instanceof NotFoundError || err instanceof z.ZodError) return { error: "invalid" };
    throw err;
  }
}
