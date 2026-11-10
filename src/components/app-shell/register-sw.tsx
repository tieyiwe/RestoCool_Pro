"use client";

import { useEffect } from "react";

/** Staff app service worker (scope /app/): instant repeat loads, a clear page when offline. */
export function RegisterStaffSw() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker
      .register("/app/sw.js", { scope: "/app/" })
      .then((r) => r.update())
      .catch(() => {});
  }, []);
  return null;
}
