"use client";

import { useEffect, useState } from "react";

/**
 * Network state shared by the whole page. Online is the default; the page switches to offline
 * mode by itself when the phone says so (`offline` event) or when one of our requests fails for
 * lack of network while the phone still claims to be online (Wi-Fi without Internet): those
 * requests dispatch `rc:net-fail`, and the next successful one `rc:net-ok`.
 */
export function reportNetwork(ok: boolean) {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ok ? "rc:net-ok" : "rc:net-fail"));
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    window.addEventListener("rc:net-ok", up);
    window.addEventListener("rc:net-fail", down);
    // Wi-Fi without Internet: check again every 20 s while offline.
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      window.removeEventListener("rc:net-ok", up);
      window.removeEventListener("rc:net-fail", down);
    };
  }, []);
  useEffect(() => {
    if (online) return;
    const id = window.setInterval(() => {
      if (!navigator.onLine) return;
      fetch("/api/health", { cache: "no-store" })
        .then((r) => r.ok && reportNetwork(true))
        .catch(() => {});
    }, 20_000);
    return () => window.clearInterval(id);
  }, [online]);
  return online;
}

/**
 * « Hors ligne » banner: tells the person to check their Internet connection and what still works;
 * when the network is back, « De nouveau en ligne » for a few seconds.
 */
export function OfflineBanner({ text, pending = 0, className = "" }: { text: { title: string; check: string; hint: string; pending?: string; back: string }; pending?: number; className?: string }) {
  const online = useOnline();
  const [wasOffline, setWasOffline] = useState(false);
  const [showBack, setShowBack] = useState(false);
  useEffect(() => {
    if (!online) setWasOffline(true);
    else if (wasOffline) {
      setShowBack(true);
      setWasOffline(false);
      const id = window.setTimeout(() => setShowBack(false), 4000);
      return () => window.clearTimeout(id);
    }
  }, [online, wasOffline]);

  if (online && !showBack) return null;
  if (online)
    return (
      <div role="status" className={`bg-emerald-700 px-4 py-2 text-center text-sm font-semibold text-white ${className}`} data-testid="online-again">
        ✓ {text.back}
      </div>
    );
  return (
    <div role="alert" className={`bg-[#7a1d17] px-4 py-2.5 text-white ${className}`} data-testid="offline-banner">
      <p className="text-sm font-extrabold">📶 {text.title}</p>
      <p className="text-sm">{text.check}</p>
      <p className="text-xs opacity-90">
        {text.hint}
        {pending > 0 && text.pending ? ` ${text.pending}` : ""}
      </p>
    </div>
  );
}
