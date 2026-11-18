"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const CHECK_MS = 5 * 60 * 1000;
const IDLE_MS = 20 * 1000;

/** Owners and managers on a computer (business app, console): they choose when to update. */
function asksFirst(path: string): boolean {
  return (path.startsWith("/app") || path.startsWith("/admin_pro")) && window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches;
}

/** Someone is typing, or a window is open: never reload under their fingers. */
function busy(): boolean {
  const a = document.activeElement as HTMLElement | null;
  if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable)) return true;
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]'));
}

/**
 * Apps update themselves when a new version is published. Every page compares its version with
 * /api/version (on opening, every 5 min, when the screen comes back and when the network returns).
 * Phones, tablets and customers: reload by themselves at a safe moment (screen coming back, or
 * 20 s without a touch, never while typing or with a window open; carts and seats are kept).
 * Owners on a computer: a pop-up « Nouvelle version disponible » → « Mettre à jour ».
 */
export function UpdateWatcher({ version, text }: { version: string; text: { title: string; body: string; update: string; later: string } }) {
  const path = usePathname() ?? "/";
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lastTouch = useRef(Date.now());
  const targetRef = useRef<string | null>(null);
  const reload = () => {
    try {
      if (targetRef.current) sessionStorage.setItem("rc-reloaded-for", targetRef.current);
    } catch {}
    window.location.reload();
  };

  const check = useCallback(async () => {
    if (!navigator.onLine) return;
    const res = await fetch("/api/version", { cache: "no-store" }).catch(() => null);
    const body = res?.ok ? ((await res.json().catch(() => null)) as { v?: string } | null) : null;
    if (!body?.v || body.v === version) return;
    // Never loop: if a reload for this version already happened and the page is still older
    // (a cache in between), stop reloading automatically; owners still get the pop-up.
    try {
      if (sessionStorage.getItem("rc-reloaded-for") === body.v && !asksFirst(window.location.pathname)) return;
    } catch {}
    targetRef.current = body.v;
    setReady(true);
  }, [version]);

  useEffect(() => {
    void check();
    const id = window.setInterval(() => void check(), CHECK_MS);
    const onVisible = () => document.visibilityState === "visible" && void check();
    const touched = () => (lastTouch.current = Date.now());
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", check);
    for (const e of ["pointerdown", "keydown", "scroll"]) window.addEventListener(e, touched, { passive: true });
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", check);
      for (const e of ["pointerdown", "keydown", "scroll"]) window.removeEventListener(e, touched);
    };
  }, [check]);

  // Automatic reload (everyone except owners on a computer), at a safe moment.
  useEffect(() => {
    if (!ready || asksFirst(path)) return;
    const tryNow = () => {
      if (!navigator.onLine || busy()) return;
      if (document.visibilityState === "hidden" || Date.now() - lastTouch.current > IDLE_MS) reload();
    };
    const onVisible = () => {
      // Coming back to the screen: update before they start using it.
      if (document.visibilityState === "visible" && navigator.onLine && !busy()) reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    const id = window.setInterval(tryNow, 5000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(id);
    };
  }, [ready, path]);

  if (!ready || dismissed || typeof window === "undefined" || !asksFirst(path)) return null;
  return (
    <div role="alertdialog" aria-labelledby="rc-update-title" className="fixed right-4 bottom-4 z-[60] w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface p-4 shadow-2xl" data-testid="update-popup">
      <p id="rc-update-title" className="font-extrabold">
        ✨ {text.title}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{text.body}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => window.location.reload()} className="min-h-11 flex-1 rounded-xl bg-primary px-4 font-bold text-primary-foreground" data-testid="update-now">
          {text.update}
        </button>
        <button type="button" onClick={() => setDismissed(true)} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">
          {text.later}
        </button>
      </div>
    </div>
  );
}
