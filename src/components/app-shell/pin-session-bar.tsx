"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { lockAction } from "@/app/poste/actions";

/**
 * On a shared tablet: who is logged in, « Verrouiller », and the automatic lock after the idle
 * time (counted from the last touch or key, also checked when the screen wakes up). The server
 * enforces the same limit on its side.
 */
export function PinSessionBar({ name, staffNo, idleMinutes }: { name: string; staffNo: string; idleMinutes: number }) {
  const t = useTranslations("poste");
  const form = useRef<HTMLFormElement>(null);
  const reason = useRef<HTMLInputElement>(null);
  const last = useRef(Date.now());

  useEffect(() => {
    const touch = () => (last.current = Date.now());
    const check = () => {
      if (Date.now() - last.current > idleMinutes * 60_000 && reason.current && form.current) {
        reason.current.value = "idle";
        form.current.requestSubmit();
      }
    };
    const events = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true });
    // Waking the screen up is not activity: check first.
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    const id = setInterval(check, 15_000);
    return () => {
      for (const e of events) window.removeEventListener(e, touch);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(id);
    };
  }, [idleMinutes]);

  return (
    <form ref={form} action={lockAction} className="flex items-center gap-2" data-testid="pin-session">
      <input ref={reason} type="hidden" name="reason" defaultValue="lock" />
      <span className="hidden text-sm font-semibold sm:inline" data-testid="pin-session-name">
        👤 {name} · {staffNo}
      </span>
      <button className="flex min-h-11 items-center gap-1 rounded-xl bg-[#17231c] px-3 text-sm font-bold text-white" data-testid="pin-lock">
        🔒 {t("lock")}
      </button>
    </form>
  );
}
