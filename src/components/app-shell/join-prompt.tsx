"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

type Pending = { count: number; latest: { id: string; name: string } | null };

/**
 * The owner (or a manager) is prompted on any screen as soon as someone scans the team QR:
 * live through the staff stream, with a slow poll as a fallback. Tap → the request to accept.
 */
export function JoinPrompt({ initial }: { initial: Pending }) {
  const t = useTranslations("join.prompt");
  const path = usePathname();
  const [p, setP] = useState(initial);
  const [hiddenFor, setHiddenFor] = useState<string | null>(null);
  const last = useRef(initial.latest?.id ?? null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/app/join-requests", { cache: "no-store" });
      if (!res.ok) return;
      const next = (await res.json()) as Pending;
      if (next.latest && next.latest.id !== last.current) {
        try {
          navigator.vibrate?.([80, 60, 80]);
        } catch {}
      }
      last.current = next.latest?.id ?? null;
      setP(next);
    } catch {
      // Offline: try again later.
    }
  }, []);

  useEffect(() => {
    const es = typeof EventSource === "undefined" ? null : new EventSource("/api/app/stream");
    es?.addEventListener("join", () => void refresh());
    const id = setInterval(() => document.visibilityState === "visible" && void refresh(), 60_000);
    return () => {
      es?.close();
      clearInterval(id);
    };
  }, [refresh]);

  if (!p.count || !p.latest || hiddenFor === p.latest.id || path?.startsWith("/app/staff")) return null;
  return (
    <div className="fixed inset-x-3 top-16 z-40 mx-auto max-w-md rounded-2xl border-2 border-or bg-surface p-3 shadow-xl print:hidden" role="alert" data-testid="join-prompt">
      <p className="font-bold">
        🙋 {p.count > 1 ? t("many", { name: p.latest.name, n: p.count - 1 }) : t("one", { name: p.latest.name })}
      </p>
      <div className="mt-2 flex gap-2">
        <Link href="/app/staff#join" className="flex min-h-11 flex-1 items-center justify-center rounded-xl bg-primary px-4 font-bold text-primary-foreground" data-testid="join-prompt-open">
          {t("open")}
        </Link>
        <button type="button" onClick={() => setHiddenFor(p.latest!.id)} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-muted-foreground">
          {t("later")}
        </button>
      </div>
    </div>
  );
}
