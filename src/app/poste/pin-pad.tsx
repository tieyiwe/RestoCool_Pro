"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { pinLoginAction, type PinState } from "./actions";

type Person = { id: string; name: string; staffNo: string; role: string; locked: boolean };

/** « Awa (serveuse) » → « A », « Issa Kaboré » → « IK »: letters only, never brackets. */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}]/gu, ""))
    .filter((w) => w && !name.includes(`(${w}`))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/** Tap your name, then type your PIN on big keys (made for a shared tablet). */
export function PinPad({ people, selected }: { people: Person[]; selected: string | null }) {
  const t = useTranslations("poste");
  const who = people.find((p) => p.id === selected) ?? null;
  const [pin, setPin] = useState("");
  const [state, action, pending] = useActionState<PinState, FormData>(pinLoginAction, undefined);

  // A wrong PIN clears what was typed.
  useEffect(() => setPin(""), [state]);

  if (!who) {
    return (
      <section aria-labelledby="who-title" className="flex flex-col gap-3">
        <h1 id="who-title" className="font-display text-2xl font-extrabold">
          {t("who")}
        </h1>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="poste-team">
          {people.map((p) => (
            <li key={p.id}>
              {/* A plain link: works the moment the page shows, even before scripts load on a slow network. */}
              <Link
                href={`/poste?who=${p.id}`}
                replace
                className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-border bg-surface p-4 text-center hover:border-primary active:scale-[.98] motion-reduce:active:scale-100"
                data-testid="poste-person"
              >
                <span className="flex size-16 items-center justify-center rounded-full bg-primary text-2xl font-extrabold text-primary-foreground" aria-hidden>
                  {initials(p.name)}
                </span>
                <span className="font-bold leading-tight">{p.name}</span>
                <span className="text-xs text-muted-foreground">
                  {p.role} · {p.staffNo}
                </span>
                {p.locked && <span className="text-xs font-semibold text-red-700">🔒 {t("personLocked")}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const press = (d: string) => setPin((v) => (v.length < 6 ? v + d : v));
  return (
    <form action={action} className="mx-auto flex w-full max-w-sm flex-col items-center gap-4" data-testid="pin-form">
      <input type="hidden" name="memberId" value={who.id} />
      <input type="hidden" name="pin" value={pin} />
      <Link href="/poste" replace className="self-start text-sm font-semibold text-primary" data-testid="pin-not-me">
        ← {t("notMe")}
      </Link>
      <span className="flex size-20 items-center justify-center rounded-full bg-primary text-3xl font-extrabold text-primary-foreground" aria-hidden>
        {initials(who.name)}
      </span>
      <p className="text-center">
        <span className="block text-xl font-extrabold">{who.name}</span>
        <span className="text-sm text-muted-foreground">
          {who.role} · {who.staffNo}
        </span>
      </p>
      <p className="font-semibold">{t("typePin")}</p>
      <div className="flex gap-3" aria-label={t("typed", { n: pin.length })} data-testid="pin-dots">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={`size-4 rounded-full border-2 border-primary ${i < pin.length ? "bg-primary" : i < 4 ? "" : "border-dashed opacity-40"}`} />
        ))}
      </div>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-center text-sm font-semibold text-red-900" data-testid="pin-error">
          {t(`error.${state.error}`, { n: state.triesLeft ?? 0, m: state.minutesLeft ?? 0 })}
        </p>
      )}
      <div className="grid w-full grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} className="min-h-16 rounded-2xl bg-muted text-2xl font-extrabold active:bg-primary/20" data-testid={`pin-key-${d}`}>
            {d}
          </button>
        ))}
        <button type="button" onClick={() => setPin((v) => v.slice(0, -1))} aria-label={t("erase")} className="min-h-16 rounded-2xl text-2xl">
          ⌫
        </button>
        <button type="button" onClick={() => press("0")} className="min-h-16 rounded-2xl bg-muted text-2xl font-extrabold active:bg-primary/20" data-testid="pin-key-0">
          0
        </button>
        <button type="submit" disabled={pin.length < 4 || pending} className="min-h-16 rounded-2xl bg-primary text-lg font-extrabold text-primary-foreground disabled:opacity-40" data-testid="pin-submit">
          {pending ? "…" : "OK"}
        </button>
      </div>
    </form>
  );
}
