import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { appErrors } from "@/db/schema";

/** Same error, different ids or numbers in the text → same group. */
function normalize(message: string) {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\d+/g, "<n>")
    .slice(0, 300);
}

const recent = new Map<string, number>();

/**
 * Records a server error for the super admin's list: grouped by message + place, counted, and
 * reopened if it comes back after being marked resolved. At most one write per group every 10 s
 * (an error loop never floods the database). Never throws.
 */
export async function recordError(message: string, where: string | null, sample?: Record<string, unknown>) {
  try {
    const fingerprint = createHash("sha1").update(`${normalize(message)}|${where ?? ""}`).digest("hex");
    const now = Date.now();
    if (now - (recent.get(fingerprint) ?? 0) < 10_000) return;
    recent.set(fingerprint, now);
    if (recent.size > 2000) recent.clear();
    await getDb()
      .insert(appErrors)
      .values({ fingerprint, message: message.slice(0, 1000), where: where?.slice(0, 300) ?? null, sample: sample ?? null })
      .onConflictDoUpdate({
        target: appErrors.fingerprint,
        set: { count: sql`${appErrors.count} + 1`, lastAt: new Date(), resolvedAt: null, sample: sample ?? null },
      });
  } catch {
    // The error list must never cause an error itself (database down, etc.).
  }
}
