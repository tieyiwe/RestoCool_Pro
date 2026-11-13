"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatFCFA } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ReleaseTable } from "./board";
import type { Floor, TableState } from "@/lib/seating/floor";

/** Most urgent first: the order of the legend and of the « to watch » filter. */
const STATES: TableState[] = ["ready", "waiting", "kitchen", "eating", "seated", "free"];

const TILE: Record<TableState, string> = {
  ready: "border-amber-500 bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100",
  waiting: "border-red-600 bg-red-50 text-red-950 dark:bg-red-900/40 dark:text-red-100",
  kitchen: "border-orange-500 bg-orange-50 text-orange-950 dark:bg-orange-900/30 dark:text-orange-100",
  eating: "border-sky-600 bg-sky-50 text-sky-950 dark:bg-sky-900/30 dark:text-sky-100",
  seated: "border-violet-500 bg-violet-50 text-violet-950 dark:bg-violet-900/30 dark:text-violet-100",
  free: "border-emerald-600 bg-emerald-50 text-emerald-950 dark:bg-emerald-900/30 dark:text-emerald-100",
};
const DOT: Record<TableState, string> = {
  ready: "bg-amber-500",
  waiting: "bg-red-600",
  kitchen: "bg-orange-500",
  eating: "bg-sky-600",
  seated: "bg-violet-500",
  free: "bg-emerald-600",
};

/**
 * Live floor plan (owner / manager dashboard, and anyone on service): every table and private
 * room with what is happening there, today's orders, and « Table libérée » on occupied tables.
 * Updates on every order or table event (staff stream), with a 20 s poll as a fallback.
 */
export function FloorPlan({ initial, canRelease }: { initial: Floor; canRelease: boolean }) {
  const t = useTranslations("floor");
  const [floor, setFloor] = useState(initial);
  const [filter, setFilter] = useState<TableState | "busy" | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const load = useCallback(async () => {
    const res = await fetch("/api/app/floor", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setFloor((await res.json()) as Floor);
    setNow(Date.now());
  }, []);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const soon = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        void load();
      }, 400);
    };
    const es = typeof EventSource === "undefined" ? null : new EventSource("/api/app/stream");
    es?.addEventListener("order", soon);
    es?.addEventListener("session", soon);
    const id = setInterval(() => document.visibilityState === "visible" && void load(), 20_000);
    return () => {
      es?.close();
      clearInterval(id);
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  const busy = floor.tables.length - floor.counts.free;
  // Most urgent first (dishes ready, orders waiting…), free tables last; tables before rooms.
  const shown = useMemo(
    () =>
      floor.tables
        .filter((x) => (filter === null ? true : filter === "busy" ? x.state !== "free" : x.state === filter))
        .sort((a, b) => STATES.indexOf(a.state) - STATES.indexOf(b.state) || (a.type === b.type ? 0 : a.type === "table" ? -1 : 1) || a.label.localeCompare(b.label, "fr", { numeric: true })),
    [floor.tables, filter],
  );
  // A room already called « Salon 201 » is not « Salon Salon 201 ».
  const name = (x: { type: string; label: string }) =>
    x.type === "room" ? (/^(salon|room|vip|包间)/i.test(x.label) ? x.label : t("room", { label: x.label })) : t("table", { label: x.label });
  const minutes = (iso: string | null) => (iso ? Math.max(0, Math.round((now - Date.parse(iso)) / 60_000)) : 0);
  const since = (iso: string | null) => {
    const m = minutes(iso);
    return m < 60 ? t("minutes", { n: m }) : t("hours", { h: Math.floor(m / 60), m: String(m % 60).padStart(2, "0") });
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4" data-testid="floor-plan" aria-labelledby="floor-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="floor-title" className="text-lg font-extrabold">
            🪑 {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <p className="text-sm font-semibold" data-testid="floor-summary">
          <span className="text-emerald-700 dark:text-emerald-300">{t("freeCount", { n: floor.counts.free })}</span>
          {" · "}
          <span>{t("busyCount", { n: busy })}</span>
        </p>
      </div>

      {/* Today's orders, every place included. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-testid="floor-today">
        {(
          [
            ["pending", "🕒", floor.today.pending],
            ["kitchen", "👩‍🍳", floor.today.kitchen],
            ["ready", "🔔", floor.today.ready],
            ["served", "✅", floor.today.served],
            ["cancelled", "✖️", floor.today.cancelled],
          ] as const
        ).map(([k, icon, n]) => (
          <div key={k} className="rounded-xl bg-muted px-3 py-2" data-testid={`floor-today-${k}`} data-n={n}>
            <p className="text-xs text-muted-foreground">
              {icon} {t(`today.${k}`)}
            </p>
            <p className="text-xl font-extrabold tabular-nums">{n}</p>
          </div>
        ))}
      </div>

      {/* Legend = filters. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label={t("filter")}>
        <button type="button" aria-pressed={filter === null} onClick={() => setFilter(null)} className="min-h-10 shrink-0 rounded-full border border-border px-3 text-sm font-semibold aria-pressed:bg-foreground aria-pressed:text-background">
          {t("all", { n: floor.tables.length })}
        </button>
        <button type="button" aria-pressed={filter === "busy"} onClick={() => setFilter(filter === "busy" ? null : "busy")} className="min-h-10 shrink-0 rounded-full border border-border px-3 text-sm font-semibold aria-pressed:bg-foreground aria-pressed:text-background" data-testid="floor-filter-busy">
          {t("busyFilter", { n: busy })}
        </button>
        {STATES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={filter === s}
            onClick={() => setFilter(filter === s ? null : s)}
            className="flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-3 text-sm font-semibold aria-pressed:bg-foreground aria-pressed:text-background"
            data-testid={`floor-filter-${s}`}
          >
            <span className={cn("h-2.5 w-2.5 rounded-full", DOT[s])} aria-hidden />
            {t(`state.${s}`)} <span className="tabular-nums">{floor.counts[s]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((x) => (
            <li
              key={x.seatId}
              className={cn("flex flex-col gap-1 rounded-xl border-2", x.state === "free" ? "px-2.5 py-1.5" : "p-2.5", TILE[x.state])}
              data-testid="floor-table"
              data-state={x.state}
              data-label={x.label}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className={cn("font-extrabold", x.state === "free" ? "text-base" : "text-lg")}>
                  {x.type === "room" ? "🚪 " : ""}
                  {name(x)}
                </p>
                {x.state !== "free" && <span className="text-xs font-semibold tabular-nums opacity-80">{since(x.since)}</span>}
              </div>
              <p className={cn("font-bold", x.state === "free" ? "text-xs" : "text-sm")}>{t(`state.${x.state}`)}</p>
              {x.state !== "free" && (
                <p className="text-xs opacity-80">
                  {x.orders > 0 ? `${t("orders", { n: x.orders })} · ${formatFCFA(x.total)}` : t("noOrderYet")}
                  {x.phones > 0 && ` · 📱 ${x.phones}`}
                </p>
              )}
              {canRelease && x.sessionId && x.state !== "free" && (
                <div className="mt-1">
                  {x.state === "eating" || x.state === "seated" ? (
                    <ReleaseTable sessionId={x.sessionId} seat={{ type: x.type, label: x.label }} onDone={() => void load()} />
                  ) : (
                    <Link href="/app/service" className="flex min-h-11 items-center justify-center rounded-xl border border-current px-3 text-sm font-semibold">
                      {t("openService")}
                    </Link>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
