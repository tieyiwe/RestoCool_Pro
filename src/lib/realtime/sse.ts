import "server-only";
import type { RtEvent } from "./events";
import { listening, subscribe } from "./listener";

const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events response. `pick` decides which events this client gets and what it is told
 * (a small hint only; the page then re-fetches through the permission-checked API).
 */
export function sseResponse(req: Request, pick: (ev: RtEvent) => string | null): Response {
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
