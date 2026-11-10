"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { GUIDES, SceneFrame, sceneFor, type Audience, type GuideId } from "./guide-scenes";

const STEP_MS = 3200;
const SEEN_KEY = "rc-guide-seen";

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function markSeen(id: string) {
  try {
    const s = readSeen();
    s.add(id);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...s]));
  } catch {
    /* storage blocked */
  }
}

/** Which tutorials this phone has watched (to the end), for the progress badges. */
export function useSeenGuides() {
  const [seen, setSeen] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSeen(readSeen());
    const onStorage = () => setSeen(readSeen());
    window.addEventListener("rc-guide-seen", onStorage);
    return () => window.removeEventListener("rc-guide-seen", onStorage);
  }, []);
  return seen;
}

/** One tutorial: animated mock-up synced with numbered steps. Autoplays unless the phone asks for less motion. */
export function GuidePlayer({ id, inApp }: { id: GuideId; inApp: boolean }) {
  const t = useTranslations("guide");
  const L = useCallback((k: string) => t(`ui.${k}`), [t]);
  const g = GUIDES.find((x) => x.id === id)!;
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const last = g.steps - 1;

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setPlaying(false);
  }, []);
  useEffect(() => {
    setStep(0);
  }, [id]);
  useEffect(() => {
    if (step === last) {
      markSeen(id);
      window.dispatchEvent(new Event("rc-guide-seen"));
    }
  }, [step, last, id]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setStep((s) => (s >= last ? 0 : s + 1)), step === last ? STEP_MS * 1.6 : STEP_MS);
    return () => window.clearTimeout(timer);
  }, [playing, step, last]);

  const scene = sceneFor(id, step, L);
  const go = (s: number) => {
    setPlaying(false);
    setStep(Math.max(0, Math.min(last, s)));
  };
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:items-center" data-testid="guide-player" data-guide={id}>
      <div className="flex flex-col items-center gap-3">
        <SceneFrame scene={scene} stepKey={`${id}-${step}`} />
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => go(step - 1)} disabled={step === 0} className="min-h-11 min-w-11 rounded-full border border-border bg-surface font-bold disabled:opacity-40" aria-label={t("prev")}>
            ←
          </button>
          <button type="button" onClick={() => setPlaying((p) => !p)} className="min-h-11 rounded-full border border-border bg-surface px-4 text-sm font-semibold" aria-pressed={playing} data-testid="guide-play">
            {playing ? `⏸ ${t("pause")}` : `▶ ${t("play")}`}
          </button>
          <button type="button" onClick={() => go(step + 1)} disabled={step === last} className="min-h-11 min-w-11 rounded-full border border-border bg-surface font-bold disabled:opacity-40" aria-label={t("next")} data-testid="guide-next">
            →
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-extrabold">
          <span aria-hidden>{g.icon} </span>
          {t(`items.${id}.title`)}
        </h2>
        <p className="text-muted-foreground">{t(`items.${id}.intro`)}</p>
        <ol className="flex flex-col gap-2" aria-live="polite">
          {Array.from({ length: g.steps }, (_, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={i === step ? "step" : undefined}
                className={cn("flex w-full items-start gap-3 rounded-xl p-3 text-left transition", i === step ? "bg-primary/10 ring-2 ring-primary" : "hover:bg-muted")}
                data-testid="guide-step"
              >
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold", i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-[#E9B530] text-[#17231C]" : "bg-muted")}>
                  {i < step ? "✓" : i + 1}
                </span>
                <span className={cn("text-sm", i === step ? "font-semibold" : "text-muted-foreground")}>{t(`items.${id}.s${i + 1}`)}</span>
              </button>
            </li>
          ))}
        </ol>
        {g.href && (inApp || !g.href.startsWith("/app")) && (
          <Link href={g.href} className="inline-flex min-h-11 items-center self-start rounded-lg bg-primary px-4 font-semibold text-primary-foreground" data-testid="guide-try">
            {t("tryIt")} →
          </Link>
        )}
      </div>
    </div>
  );
}

/** Tutorial list with the player of the chosen one. */
export function GuideCenter({ audience, initial, inApp }: { audience: Audience; initial: GuideId | null; inApp: boolean }) {
  const t = useTranslations("guide");
  const seen = useSeenGuides();
  const list = GUIDES.filter((g) => g.audience === audience);
  const [current, setCurrent] = useState<GuideId>(initial && list.some((g) => g.id === initial) ? initial : list[0]!.id);
  const done = list.filter((g) => seen.has(g.id)).length;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold" data-testid="guide-progress">
          {t("progress", { done, total: list.length })}
        </p>
        <div className="h-2 w-40 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full bg-primary transition-all" style={{ width: `${(done / list.length) * 100}%` }} />
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" aria-label={t("listLabel")}>
        {list.map((g) => (
          <li key={g.id}>
            <button
              type="button"
              onClick={() => {
                setCurrent(g.id);
                document.getElementById("guide-player-anchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              aria-pressed={current === g.id}
              className={cn("flex h-full min-h-16 w-full items-center gap-2 rounded-2xl border p-3 text-left text-sm font-semibold transition", current === g.id ? "border-primary bg-primary/10" : "border-border bg-surface hover:bg-muted")}
              data-testid="guide-card"
            >
              <span className="text-xl" aria-hidden>
                {g.icon}
              </span>
              <span className="flex-1">{t(`items.${g.id}.title`)}</span>
              {seen.has(g.id) && (
                <span className="text-primary" title={t("seen")}>
                  ✓<span className="sr-only">{t("seen")}</span>
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      <div id="guide-player-anchor" className="scroll-mt-20 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-7">
        <GuidePlayer key={current} id={current} inApp={inApp} />
      </div>
    </div>
  );
}
