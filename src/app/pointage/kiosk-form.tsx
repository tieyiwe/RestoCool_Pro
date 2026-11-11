"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { punchAction, type KioskState } from "./actions";

/** Matricule + PIN, big keys for a shared phone or tablet near the entrance. */
export function KioskForm({ token, askRc }: { token?: string; askRc?: boolean }) {
  const t = useTranslations("pointage");
  const [state, action, pending] = useActionState<KioskState, FormData>(punchAction, undefined);
  const [staffNo, setStaffNo] = useState("");
  const [pin, setPin] = useState("");
  // Controlled, so React's reset after each submission doesn't wipe the restaurant's number.
  const [rc, setRc] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  // After a successful check-in/out, clear the form for the next person.
  useEffect(() => {
    if (state?.ok) {
      setStaffNo("");
      setPin("");
      const id = window.setTimeout(() => formRef.current?.querySelector<HTMLInputElement>("input[name=staffNo]")?.focus(), 50);
      return () => window.clearTimeout(id);
    }
  }, [state]);
  const input = "min-h-14 w-full rounded-2xl border border-border bg-background px-4 text-center font-mono text-2xl tracking-[0.3em] outline-none focus:border-primary focus:ring-4 focus:ring-primary/15";
  const hours = (m: number) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4" data-testid="kiosk-form">
      {token && <input type="hidden" name="token" value={token} />}
      {askRc && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">{t("rc")}</span>
          <input
            name="rc"
            required
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="RC-K7M3P"
            value={rc}
            onChange={(e) => setRc(e.target.value.toUpperCase().slice(0, 12))}
            className={`${input} rc-code-input font-mono font-bold tracking-widest`}
            autoFocus
          />
        </label>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">{t("staffNo")}</span>
        <input
          name="staffNo"
          required
          inputMode="numeric"
          autoComplete="off"
          placeholder="002"
          value={staffNo}
          onChange={(e) => setStaffNo(e.target.value.replace(/\D/g, "").slice(0, 4))}
          className={input}
          autoFocus={!askRc}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">{t("pin")}</span>
        <input
          name="pin"
          type="password"
          required
          inputMode="numeric"
          autoComplete="off"
          placeholder="••••"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className={input}
        />
      </label>
      <button type="submit" disabled={pending} className="min-h-14 rounded-2xl bg-primary text-lg font-extrabold text-primary-foreground disabled:opacity-60" data-testid="kiosk-submit">
        {pending ? t("sending") : t("submit")}
      </button>
      {state?.ok && (
        <div role="status" className={state.action === "in" ? "rounded-2xl bg-emerald-50 p-4 text-emerald-950" : "rounded-2xl bg-sky-50 p-4 text-sky-950"} data-testid="kiosk-result" data-action={state.action}>
          <p className="text-xl font-extrabold">{state.action === "in" ? t("hello", { name: state.name }) : t("bye", { name: state.name })}</p>
          <p>{state.action === "in" ? t("inAt", { time: state.time }) : t("outAt", { time: state.time, hours: hours(state.minutes ?? 0) })}</p>
        </div>
      )}
      {state && !state.ok && (
        <p role="alert" className="rounded-2xl bg-red-50 p-4 font-semibold text-red-900" data-testid="kiosk-error">
          {t(`error.${state.error}`, { minutes: state.minutesLeft ?? 10, tries: state.triesLeft ?? 0 })}
        </p>
      )}
      <a href="/guide?for=staff" className="text-center text-sm font-semibold text-primary underline-offset-2 hover:underline" data-testid="kiosk-guide">
        🎓 {t("guideLink")}
      </a>
    </form>
  );
}
