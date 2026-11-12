import { setErrorSink } from "./lib/log";
import { recordError } from "./lib/platform/errors";
import { getPlatformSettings } from "./lib/platform/settings";
import { startTrafficClock } from "./lib/usage/presence";

/** Node-only start-up work (database access): never bundled for the edge runtime. */
export function startNode() {
  setErrorSink((msg, data) => {
    const err = data && Object.values(data).find((v) => v instanceof Error);
    void recordError(err instanceof Error ? `${msg}: ${err.message}` : msg, null, data ? { keys: Object.keys(data) } : undefined);
  });
  void getPlatformSettings().catch(() => {});
  startTrafficClock();
}

export async function reportRequestError(err: unknown, path: string, context: { routePath?: string; routeType?: string }, method: string) {
  const e = err as { message?: string; digest?: string };
  // Next's own redirects / not-found are not errors.
  if (typeof e?.digest === "string" && /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR)/.test(e.digest)) return;
  await recordError(e?.message ?? String(err), context.routePath ?? path.split("?")[0] ?? null, { method, type: context.routeType ?? null, digest: e?.digest ?? null });
}
