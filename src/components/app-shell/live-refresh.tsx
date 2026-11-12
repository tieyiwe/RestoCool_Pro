"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the page when an order changes (staff stream), with a slow poll as a fallback. */
export function LiveRefresh({ events = ["order"], every = 20_000 }: { events?: string[]; every?: number }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) return;
      // Several events at once (a whole round confirmed): one refresh.
      timer = setTimeout(() => {
        timer = null;
        router.refresh();
      }, 400);
    };
    const es = typeof EventSource === "undefined" ? null : new EventSource("/api/app/stream");
    for (const e of events) es?.addEventListener(e, refresh);
    // A message from the RestoCool team: the bell checks right away.
    es?.addEventListener("notice", () => window.dispatchEvent(new Event("rc:notice")));
    const id = setInterval(() => document.visibilityState === "visible" && router.refresh(), every);
    return () => {
      es?.close();
      clearInterval(id);
      if (timer) clearTimeout(timer);
    };
  }, [router, events, every]);
  return null;
}
