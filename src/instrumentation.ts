/**
 * Server start-up (Next.js instrumentation): load the platform settings (launch offer…) and send
 * every server error to the super admin's error list (/admin_pro/activity). The database code lives
 * in instrumentation-node.ts, imported only on the Node runtime (never bundled for the edge).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startNode } = await import("./instrumentation-node");
    startNode();
  }
}

/** Uncaught errors in pages, route handlers and server actions. */
export async function onRequestError(err: unknown, request: { path: string; method: string }, context: { routePath?: string; routeType?: string }) {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reportRequestError } = await import("./instrumentation-node");
    await reportRequestError(err, request.path, context, request.method);
  }
}
