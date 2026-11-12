"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const BEAT_MS = 60_000;

function anonId(): string | undefined {
  try {
    const known = localStorage.getItem("rc-device") ?? localStorage.getItem("rc-visit");
    if (known) return known;
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    const id = btoa(String.fromCharCode(...b)).replace(/[+/=]/g, "");
    localStorage.setItem("rc-visit", id);
    return id;
  } catch {
    return undefined;
  }
}

/**
 * Live traffic: one tiny request when a page opens and every minute while it stays visible
 * (none while the screen is off or the tab hidden). The app screens also count usage time.
 * Nothing on the super admin console.
 */
export function Beat() {
  const path = usePathname();
  useEffect(() => {
    if (!path || path.startsWith("/admin_pro") || path.startsWith("/api")) return;
    const app = path === "/app" || path.startsWith("/app/");
    const url = app ? "/api/app/heartbeat" : "/api/public/beat";
    const touch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
    const standalone = typeof matchMedia !== "undefined" && matchMedia("(display-mode: standalone)").matches;
    const send = (kind: "view" | "beat") => {
      if (document.visibilityState !== "visible") return;
      const body = JSON.stringify(app ? { kind, path, touch, standalone } : { path, deviceId: anonId(), touch, standalone });
      fetch(url, { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true, credentials: "same-origin" }).catch(() => {});
    };
    send("view");
    const timer = setInterval(() => send("beat"), BEAT_MS);
    const onVisible = () => document.visibilityState === "visible" && send("beat");
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [path]);
  return null;
}
