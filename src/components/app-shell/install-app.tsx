"use client";

import { useEffect, useState } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const KEY = "rc-install-dismissed";
const AGAIN_MS = 14 * 86_400_000;

function dismissedRecently() {
  try {
    return Date.now() - Number(localStorage.getItem(KEY) ?? 0) < AGAIN_MS;
  } catch {
    return false;
  }
}

/**
 * « Installer RestoCool » on this computer (or phone): one click where the browser allows it
 * (Chrome, Edge), otherwise the steps (Safari: « Ajouter au Dock » / « Sur l’écran d’accueil »).
 * Hidden once installed, and for 14 days after « Plus tard ».
 */
export function InstallApp({ labels, variant = "card" }: { labels: { title: string; text: string; install: string; later: string; safariMac: string; ios: string; done: string }; variant?: "card" | "banner" }) {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [mode, setMode] = useState<"hidden" | "prompt" | "safariMac" | "ios" | "done">("hidden");

  useEffect(() => {
    const standalone = matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: window-controls-overlay)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (standalone || dismissedRecently()) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
      setMode("prompt");
    };
    const onInstalled = () => setMode("done");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const ua = navigator.userAgent;
    const safari = /safari/i.test(ua) && !/chrome|crios|chromium|edg|firefox|fxios/i.test(ua);
    if (safari && /iphone|ipad|ipod/i.test(ua)) setMode("ios");
    else if (safari && /macintosh/i.test(ua)) setMode(navigator.maxTouchPoints > 0 ? "ios" : "safariMac");
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (mode === "hidden") return null;
  const later = () => {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setMode("hidden");
  };
  const install = async () => {
    if (!evt) return;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    setEvt(null);
    setMode(outcome === "accepted" ? "done" : "hidden");
  };
  const box = variant === "card" ? "rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-transparent p-3 text-sm" : "flex flex-wrap items-center gap-3 rounded-2xl border border-primary/40 bg-primary/5 p-4";
  return (
    <div className={box} data-testid="install-app" role="region" aria-label={labels.title}>
      {mode === "done" ? (
        <p className="font-semibold">✓ {labels.done}</p>
      ) : (
        <>
          <div className={variant === "banner" ? "min-w-48 flex-1" : ""}>
            <p className="font-bold">💻 {labels.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{mode === "safariMac" ? labels.safariMac : mode === "ios" ? labels.ios : labels.text}</p>
          </div>
          <div className={`flex gap-2 ${variant === "card" ? "mt-2" : ""}`}>
            {mode === "prompt" && (
              <button type="button" onClick={install} className="min-h-10 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground" data-testid="install-app-button">
                {labels.install}
              </button>
            )}
            <button type="button" onClick={later} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-muted">
              {labels.later}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
