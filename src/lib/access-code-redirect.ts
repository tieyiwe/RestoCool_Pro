import "server-only";
import { headers } from "next/headers";
import { getDb } from "@/db";
import { normalizeCode, resolveCode } from "@/lib/access-codes";
import { rateLimit } from "@/lib/rate-limit";

export type CodeLookup = { ok: true; path: string } | { ok: false; error: "invalid" | "notFound" | "tooMany" };

/**
 * Turns a typed code into the page its QR opens. Rate limited per IP (codes are short, so
 * guessing must stay slow): 10 tries, then one every 6 seconds.
 */
export async function lookupCode(raw: string): Promise<CodeLookup> {
  if (!normalizeCode(raw)) return { ok: false, error: "invalid" };
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
  if (!rateLimit(`code:${ip}`, { capacity: 10, refillPerSec: 1 / 6 })) return { ok: false, error: "tooMany" };
  const found = await resolveCode(getDb(), raw);
  if (!found) return { ok: false, error: "notFound" };
  return { ok: true, path: found.seatToken ? `/r/${found.slug}/t/${found.seatToken}` : `/r/${found.slug}` };
}
