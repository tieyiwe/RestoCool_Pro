import "server-only";
import type { RtEvent } from "./events";
import { listening, subscribe } from "./listener";

const HEARTBEAT_MS = 25_000;

/** Open streams per key (an IP for customers, a person for staff): one machine can't exhaust the server. */
const open = new Map<string, number>();
export const SSE_LIMITS = { customerPerIp: 40, staffPerPerson: 8 } as const;

function tooManyStreams() {
  return new Response("Too many live connections", { status: 429, headers: { "Retry-After": "15", "Cache-Control": "no-store" } });
}

/**
 * Server-Sent Events response. `pick` decides which events this client gets and what it is told
 * (a small hint only; the page then re-fetches through the permission-checked API).
 */
export function sseResponse(req: Request, pick: (ev: RtEvent) => string | null, limit?: { key: string; max: number }): Response {
  if (limit && (open.get(limit.key) ?? 0) >= limit.max) return tooManyStreams();
  if (limit) open.set(limit.key, (open.get(limit.key) ?? 0) + 1);
  let released = false;
  const release = () => {
    if (!limit || released) return;
    released = true;
    const n = (open.get(limit.key) ?? 1) - 1;
    if (n <= 0) open.delete(limit.key);
    else open.set(limit.key, n);
  };
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          close();
        }
      };
      const unsubscribe = await subscribe((ev) => {
        // The database connection dropped: end the stream; the browser retries and polls meanwhile.
        if (ev === null) return close();
        const kind = pick(ev);
        if (kind) send(`event: ${kind}\ndata: {}\n\n`);
      });
      const beat = setInterval(() => send(`: ping\n\n`), HEARTBEAT_MS);
      function close() {
        if (closed) return;
        closed = true;
        release();
        clearInterval(beat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
      cleanup = close;
      req.signal.addEventListener("abort", close);
      // Tell the browser to retry after 3 s if the connection drops; confirm the stream is live.
      // Without a LISTEN connection no event would ever come: never say « ready » then, close
      // so the screen keeps polling and retries.
      if (!listening()) {
        send(`retry: 3000\n\n`);
        return close();
      }
      send(`retry: 3000\nevent: ready\ndata: {}\n\n`);
    },
    cancel() {
      cleanup();
      release();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
