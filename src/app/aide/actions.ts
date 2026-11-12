"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { ipFromHeaders, rateLimit } from "@/lib/rate-limit";
import { notifyAdminsOfRequestRef } from "@/lib/support/alerts";
import { createPublicRequest } from "@/lib/support/requests";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Locked out or forgot: the request reaches TIBLOGICS, who calls back and verifies before helping. */
export async function publicHelpAction(fd: FormData) {
  const h = await headers();
  if (!rateLimit(`aide:${ipFromHeaders(h)}`, { capacity: 3, refillPerSec: 1 / 900 })) redirect("/aide?error=tooMany");
  // Honeypot: real people never fill it.
  if (s(fd, "website")) redirect("/aide?sent=1");
  let ref: string;
  try {
    ref = (await createPublicRequest(getDb(), { rc: s(fd, "rc"), businessName: s(fd, "businessName"), name: s(fd, "name"), phone: s(fd, "phone"), role: s(fd, "role") || undefined, urgency: s(fd, "urgency"), body: s(fd, "body") }, { userAgent: h.get("user-agent") })).ref;
  } catch (err) {
    if (err instanceof z.ZodError) redirect("/aide?error=invalid");
    throw err;
  }
  after(() => notifyAdminsOfRequestRef(getDb(), ref));
  redirect(`/aide?sent=${encodeURIComponent(ref)}`);
}
