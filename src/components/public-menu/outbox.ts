"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CartLine } from "@/lib/public-menu/types";
import type { MySeat } from "./seating";
import { sendOrder, type CustomerOrder } from "./orders";

/**
 * Orders confirmed without network wait on the phone (localStorage, per business) and leave by
 * themselves as soon as the connection is back. Each keeps the request id it was confirmed with:
 * the server answers a resend with the same order, so an order is never sent twice.
 * After 30 minutes a waiting order is no longer sent automatically (the customer may have left):
 * they choose « Envoyer quand même » or « Supprimer ».
 */
import { OUTBOX_AUTO_MS } from "./outbox-config";
export { OUTBOX_AUTO_MS };

export type QueuedOrder = {
  requestId: string;
  seat: MySeat;
  lines: CartLine[];
  extra: { customerName?: string; customerPhone?: string; deliveryAddress?: string; pickupTime?: string };
  /** What the customer sees while it waits (names in every language, quantities, the estimated total). */
  summary: Array<{ name: Record<string, string | undefined>; code: string | null; qty: number }>;
  total: number;
  queuedAt: number;
  /** Refused when it was finally sent (sold out, table closed…): shown with the reason, never resent alone. */
  error?: string;
};

const key = (slug: string) => `rc-outbox-${slug}`;

function read(slug: string): QueuedOrder[] {
  try {
    const v = JSON.parse(localStorage.getItem(key(slug)) ?? "[]") as unknown;
    return Array.isArray(v) ? (v as QueuedOrder[]) : [];
  } catch {
    return [];
  }
}
function write(slug: string, list: QueuedOrder[]) {
  try {
    if (list.length) localStorage.setItem(key(slug), JSON.stringify(list));
    else localStorage.removeItem(key(slug));
  } catch {
    /* private mode: the queue lives as long as the page */
  }
}

export function useOrderOutbox(slug: string, onSent: (order: CustomerOrder, q: QueuedOrder) => void, onRefused: (q: QueuedOrder, error: string, itemIds: string[]) => void) {
  const [queue, setQueue] = useState<QueuedOrder[]>([]);
  const [online, setOnline] = useState(true);
  const busy = useRef(false);
  const cbs = useRef({ onSent, onRefused });
  cbs.current = { onSent, onRefused };

  useEffect(() => {
    setQueue(read(slug));
    setOnline(navigator.onLine);
  }, [slug]);

  const save = useCallback(
    (next: QueuedOrder[]) => {
      write(slug, next);
      setQueue(next);
    },
    [slug],
  );

  const add = useCallback((q: QueuedOrder) => save([...read(slug).filter((x) => x.requestId !== q.requestId), q]), [save, slug]);
  const remove = useCallback((requestId: string) => save(read(slug).filter((x) => x.requestId !== requestId)), [save, slug]);

  /** Send what is waiting, oldest first. `force`: also the old ones (the customer asked). */
  const flush = useCallback(
    async (force?: string) => {
      if (busy.current) return;
      busy.current = true;
      try {
        for (const q of read(slug)) {
          if (q.error && q.requestId !== force) continue;
          if (Date.now() - q.queuedAt > OUTBOX_AUTO_MS && q.requestId !== force) continue;
          const res = await sendOrder(slug, q.seat, q.lines, q.extra, q.requestId);
          if (res.ok) {
            save(read(slug).filter((x) => x.requestId !== q.requestId));
            cbs.current.onSent(res.order, q);
          } else if (res.error === "network" || res.error === "rate_limited") {
            break; // still offline: try again later, in the same order
          } else {
            save(read(slug).map((x) => (x.requestId === q.requestId ? { ...x, error: res.error } : x)));
            cbs.current.onRefused(q, res.error, res.itemIds);
          }
        }
      } finally {
        busy.current = false;
      }
    },
    [save, slug],
  );

  // Back online, back on the page, or every 15 s while something waits.
  useEffect(() => {
    const up = () => {
      setOnline(true);
      void flush();
    };
    const down = () => setOnline(false);
    const visible = () => document.visibilityState === "visible" && void flush();
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [flush]);
  const waiting = queue.some((q) => !q.error);
  useEffect(() => {
    if (!waiting) return;
    void flush();
    const id = window.setInterval(() => void flush(), 15_000);
    return () => window.clearInterval(id);
  }, [waiting, flush]);

  return { queue, online, add, remove, flush };
}
