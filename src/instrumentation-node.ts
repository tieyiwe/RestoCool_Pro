import { setErrorSink } from "./lib/log";
import { recordError } from "./lib/platform/errors";
import { getPlatformSettings } from "./lib/platform/settings";
import { startTrafficClock } from "./lib/usage/presence";
import { getDb } from "./db";
import { processDeletions } from "./lib/restaurants/deletion";
import { sweepAllStale } from "./lib/seating/sessions";
import { sweepReservations } from "./lib/reservations";
import { log } from "./lib/log";

/** Node-only start-up work (database access): never bundled for the edge runtime. */
export function startNode() {
  setErrorSink((msg, data) => {
    const err = data && Object.values(data).find((v) => v instanceof Error);
    void recordError(err instanceof Error ? `${msg}: ${err.message}` : msg, null, data ? { keys: Object.keys(data) } : undefined);
  });
  void getPlatformSettings().catch(() => {});
  startTrafficClock();
  // Business deletions: carried out after 72 h once confirmed, purged after the 10 days to restore.
  const g = globalThis as unknown as { __rcDeletionTimer?: ReturnType<typeof setInterval> };
  if (!g.__rcDeletionTimer) {
    g.__rcDeletionTimer = setInterval(() => {
      processDeletions(getDb()).catch((err) => log.warn("deletion.process_failed", { error: err instanceof Error ? err.message : String(err) }));
    }, 5 * 60_000);
    g.__rcDeletionTimer.unref?.();
  }
  // Tables and rooms left « occupied » by customers who went away are freed, in every business.
  const gs = globalThis as unknown as { __rcSeatTimer?: ReturnType<typeof setInterval> };
  if (!gs.__rcSeatTimer) {
    gs.__rcSeatTimer = setInterval(() => {
      sweepAllStale(getDb()).catch((err) => log.warn("seating.sweep_failed", { error: err instanceof Error ? err.message : String(err) }));
      // Reservations past their time + expiry: confirmed → « Absent », never answered → « Expirée ».
      sweepReservations(getDb()).catch((err) => log.warn("reservations.sweep_failed", { error: err instanceof Error ? err.message : String(err) }));
    }, 5 * 60_000);
    gs.__rcSeatTimer.unref?.();
  }
}

export async function reportRequestError(err: unknown, path: string, context: { routePath?: string; routeType?: string }, method: string) {
  const e = err as { message?: string; digest?: string };
  // Next's own redirects / not-found are not errors.
  if (typeof e?.digest === "string" && /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR)/.test(e.digest)) return;
  await recordError(e?.message ?? String(err), context.routePath ?? path.split("?")[0] ?? null, { method, type: context.routeType ?? null, digest: e?.digest ?? null });
}
