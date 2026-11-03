"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type DemoStrings = {
  customer: string;
  server: string;
  play: string;
  pause: string;
  prev: string;
  next: string;
  chapters: [string, string, string, string, string];
  ui: {
    scanHint: string;
    tableDetected: string;
    restaurant: string;
    tabs: [string, string, string];
    chooseVariant: string;
    half: string;
    whole: string;
    mySelection: string;
    itemsByCount: string[];
    showServer: string;
    table: string;
    orderNo: string;
    scanOrder: string;
    newOrder: string;
    confirm: string;
    confirmed: string;
    statuses: [string, string, string, string, string];
    served: string;
    total: string;
  };
  dishes: { chicken: string; rice: string; bissap: string };
  prices: { chickenHalf: string; chickenWhole: string; rice: string; bissap: string; bissapTwo: string; totals: string[] };
};

type CustomerScene = "scan" | "scanned" | "menu" | "sheet" | "show" | "track";
type ServerScene = "idle" | "scan" | "order" | "confirmed";
type Tap = "chicken-add" | "variant-whole" | "bissap-add" | "open-sheet" | "show-server" | "confirm";

type Frame = {
  ms: number;
  chapter: 0 | 1 | 2 | 3 | 4;
  customer: CustomerScene;
  server: ServerScene;
  /** Which phone matters in this frame (the only one shown on small screens). */
  focus: "customer" | "server";
  tap?: Tap;
  variantOpen?: boolean;
  chicken: 0 | 1;
  bissap: 0 | 1 | 2;
  status?: 0 | 1 | 2 | 3 | 4;
};

const FRAMES: Frame[] = [
  { ms: 2800, chapter: 0, customer: "scan", server: "idle", focus: "customer", chicken: 0, bissap: 0 },
  { ms: 1500, chapter: 0, customer: "scanned", server: "idle", focus: "customer", chicken: 0, bissap: 0 },
  { ms: 1500, chapter: 1, customer: "menu", server: "idle", focus: "customer", tap: "chicken-add", chicken: 0, bissap: 0 },
  { ms: 1900, chapter: 1, customer: "menu", server: "idle", focus: "customer", variantOpen: true, tap: "variant-whole", chicken: 0, bissap: 0 },
  { ms: 1100, chapter: 1, customer: "menu", server: "idle", focus: "customer", chicken: 1, bissap: 0 },
  { ms: 1100, chapter: 1, customer: "menu", server: "idle", focus: "customer", tap: "bissap-add", chicken: 1, bissap: 1 },
  { ms: 1300, chapter: 1, customer: "menu", server: "idle", focus: "customer", tap: "bissap-add", chicken: 1, bissap: 2 },
  { ms: 1200, chapter: 2, customer: "menu", server: "idle", focus: "customer", tap: "open-sheet", chicken: 1, bissap: 2 },
  { ms: 2200, chapter: 2, customer: "sheet", server: "idle", focus: "customer", tap: "show-server", chicken: 1, bissap: 2 },
  { ms: 2200, chapter: 2, customer: "show", server: "idle", focus: "customer", chicken: 1, bissap: 2 },
  { ms: 3000, chapter: 3, customer: "show", server: "scan", focus: "server", chicken: 1, bissap: 2 },
  { ms: 2300, chapter: 3, customer: "show", server: "order", focus: "server", tap: "confirm", chicken: 1, bissap: 2 },
  { ms: 1600, chapter: 4, customer: "track", server: "confirmed", focus: "customer", chicken: 1, bissap: 2, status: 1 },
  { ms: 1500, chapter: 4, customer: "track", server: "confirmed", focus: "customer", chicken: 1, bissap: 2, status: 2 },
  { ms: 1500, chapter: 4, customer: "track", server: "confirmed", focus: "customer", chicken: 1, bissap: 2, status: 3 },
  { ms: 3600, chapter: 4, customer: "track", server: "confirmed", focus: "customer", chicken: 1, bissap: 2, status: 4 },
];

const FIRST_FRAME_OF_CHAPTER = [0, 1, 2, 3, 4].map((c) => FRAMES.findIndex((f) => f.chapter === c));

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function DemoAnimation({ s, tableQr, orderQr }: { s: DemoStrings; tableQr: string; orderQr: string }) {
  const reduced = usePrefersReducedMotion();
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const frame = FRAMES[frameIndex]!;

  // Reduced motion: never auto-play; the visitor steps through with the buttons.
  useEffect(() => {
    if (reduced) setPlaying(false);
  }, [reduced]);

  // Only animate while on screen (saves battery on entry-level phones).
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !visible) return;
    const id = window.setTimeout(() => setFrameIndex((i) => (i + 1) % FRAMES.length), frame.ms);
    return () => window.clearTimeout(id);
  }, [playing, visible, frameIndex, frame.ms]);

  const goChapter = useCallback((chapter: number) => {
    const c = (chapter + 5) % 5;
    setFrameIndex(FIRST_FRAME_OF_CHAPTER[c]!);
  }, []);

  const itemCount = frame.chicken + frame.bissap;
  const totalIndex = frame.chicken === 0 ? 0 : 1 + frame.bissap;
  const total = s.prices.totals[totalIndex]!;

  return (
    <div ref={rootRef} className="flex flex-col items-center gap-6" data-testid="demo-animation" data-frame={frameIndex}>
      {/* Chapter caption (announced to screen readers) */}
      <p aria-live="polite" data-testid="demo-caption" className="font-display min-h-14 max-w-xl text-center text-xl font-extrabold md:text-2xl">
        <span className="mr-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-or align-middle text-base text-encre">
          {frame.chapter + 1}
        </span>
        {s.chapters[frame.chapter]}
      </p>

      <div className="flex w-full items-start justify-center gap-6 md:gap-10">
        <Phone
          label={s.customer}
          active={frame.focus === "customer"}
          className={cn(frame.focus !== "customer" && "max-md:hidden")}
        >
          <CustomerScreen s={s} frame={frame} tableQr={tableQr} orderQr={orderQr} itemCount={itemCount} total={total} />
        </Phone>
        <Phone
          label={s.server}
          active={frame.focus === "server"}
          className={cn(frame.focus !== "server" && "max-md:hidden")}
          dark
        >
          <ServerScreen s={s} frame={frame} orderQr={orderQr} itemCount={itemCount} total={total} />
        </Phone>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => goChapter(frame.chapter - 1)}
          aria-label={s.prev}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface hover:bg-muted"
        >
          <span aria-hidden>‹</span>
        </button>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-pressed={playing}
          className="flex min-h-11 items-center gap-2 rounded-full bg-primary px-5 font-semibold text-primary-foreground"
        >
          <span aria-hidden>{playing ? "❚❚" : "▶"}</span>
          {playing ? s.pause : s.play}
        </button>
        <button
          type="button"
          onClick={() => goChapter(frame.chapter + 1)}
          aria-label={s.next}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface hover:bg-muted"
        >
          <span aria-hidden>›</span>
        </button>
      </div>
      <ol className="flex flex-wrap justify-center gap-2" aria-label={s.chapters.join(" · ")}>
        {s.chapters.map((c, i) => (
          <li key={c}>
            <button
              type="button"
              onClick={() => goChapter(i)}
              aria-current={frame.chapter === i ? "step" : undefined}
              title={c}
              className="flex h-11 min-w-11 items-center justify-center rounded-full px-1"
            >
              <span
                className={cn(
                  "block h-2.5 rounded-full transition-all",
                  frame.chapter === i ? "w-8 bg-vert" : "w-2.5 bg-ligne",
                )}
              />
              <span className="sr-only">{c}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------- Phone frame ---------- */

function Phone({
  label,
  active,
  dark,
  className,
  children,
}: {
  label: string;
  active: boolean;
  dark?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <figure className={cn("flex flex-col items-center gap-3 transition-all duration-500", !active && "md:scale-95 md:opacity-60", className)}>
      <div
        className={cn(
          "relative h-[540px] w-[268px] rounded-[2.6rem] border-[10px] shadow-2xl",
          dark ? "border-nuit bg-nuit" : "border-encre bg-encre",
        )}
      >
        <div className="absolute top-1.5 left-1/2 z-30 h-5 w-24 -translate-x-1/2 rounded-full bg-black/80" aria-hidden />
        <div className="relative h-full w-full overflow-hidden rounded-[2rem] bg-creme text-encre">{children}</div>
      </div>
      <figcaption className="flex items-center gap-2 text-sm font-bold">
        <span className={cn("h-2.5 w-2.5 rounded-full", active ? "bg-vert demo-pulse" : "bg-ligne")} aria-hidden />
        {label}
      </figcaption>
    </figure>
  );
}

function Tapped({ on, children, className }: { on: boolean; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("relative inline-flex", className)}>
      {children}
      {on && <span className="demo-tap" aria-hidden />}
    </span>
  );
}

/* ---------- Customer phone ---------- */

function CustomerScreen({
  s,
  frame,
  tableQr,
  orderQr,
  itemCount,
  total,
}: {
  s: DemoStrings;
  frame: Frame;
  tableQr: string;
  orderQr: string;
  itemCount: number;
  total: string;
}) {
  if (frame.customer === "scan" || frame.customer === "scanned") {
    return (
      <div className="relative flex h-full flex-col items-center justify-center bg-[#2a2a28] p-6">
        {/* Table tent card seen through the camera */}
        <div className="demo-float flex w-40 flex-col items-center gap-2 rounded-2xl bg-white p-3 shadow-xl">
          <span className="font-display text-xs font-extrabold text-vert">{s.ui.restaurant}</span>
          <div className="w-28" dangerouslySetInnerHTML={{ __html: tableQr }} />
          <span className="font-display text-lg font-extrabold">
            {s.ui.table} 7
          </span>
        </div>
        {/* Viewfinder */}
        <div className="pointer-events-none absolute inset-x-10 top-[118px] h-[200px] rounded-3xl border-4 border-or/90">
          {frame.customer === "scan" && <div className="demo-beam" />}
        </div>
        <p className="absolute bottom-10 rounded-full bg-black/60 px-4 py-2 text-sm font-bold text-white">
          {frame.customer === "scan" ? s.ui.scanHint : `✓ ${s.ui.tableDetected}`}
        </p>
      </div>
    );
  }

  if (frame.customer === "show") {
    return (
      <div className="demo-fade-in flex h-full flex-col items-center justify-center gap-4 bg-encre p-5 text-creme">
        <p className="text-sm font-bold tracking-wide uppercase opacity-80">{s.ui.orderNo}</p>
        <div className="flex flex-col items-center rounded-3xl bg-or px-8 py-3 text-encre">
          <span className="text-xs font-bold uppercase">{s.ui.table}</span>
          <span className="font-display text-6xl leading-none font-extrabold">7</span>
        </div>
        <div className="w-44 rounded-2xl bg-white p-2" dangerouslySetInnerHTML={{ __html: orderQr }} />
        <p className="text-center text-sm">
          {s.ui.itemsByCount[itemCount]} · <span className="font-bold tabular-nums">{total}</span>
        </p>
      </div>
    );
  }

  if (frame.customer === "track") {
    const status = frame.status ?? 0;
    const done = (i: number) => i < status || (status === 4 && i === 4);
    return (
      <div className="demo-fade-in relative flex h-full flex-col bg-creme px-5 pt-12 pb-5">
        <p className="text-xs font-bold text-muted-foreground">{s.ui.orderNo}</p>
        <p className="font-display mb-4 text-2xl font-extrabold">
          {s.ui.table} 7
        </p>
        <ol className="flex flex-col gap-3">
          {s.ui.statuses.map((label, i) => (
            <li key={label} className="flex items-center gap-3">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-500",
                  done(i) && "bg-vert text-creme",
                  i === status && !done(i) && "demo-pulse bg-or text-encre",
                  i > status && "bg-sable text-encre-2",
                )}
                aria-hidden
              >
                {done(i) ? "✓" : i + 1}
              </span>
              <span className={cn("text-sm", i <= status ? "font-bold" : "text-encre-2")}>{label}</span>
            </li>
          ))}
        </ol>
        {status === 4 && (
          <>
            <Confetti />
            <div className="demo-pop absolute inset-x-4 bottom-6 rounded-2xl bg-vert p-4 text-center text-creme shadow-xl">
              <p className="text-3xl" aria-hidden>
                🍽️
              </p>
              <p className="font-display text-lg leading-tight font-extrabold">{s.ui.served}</p>
            </div>
          </>
        )}
      </div>
    );
  }

  // Menu (+ variant chooser) and "Ma sélection" sheet
  return (
    <div className="relative flex h-full flex-col bg-creme">
      <div className="bg-vert px-4 pt-9 pb-3 text-creme">
        <p className="font-display text-lg font-extrabold">{s.ui.restaurant}</p>
        <p className="text-[11px] opacity-90">
          {s.ui.table} 7 · Ouagadougou
        </p>
      </div>
      <div className="flex gap-1.5 border-b border-ligne bg-creme px-3 py-2">
        {s.ui.tabs.map((tab, i) => (
          <span key={tab} className={cn("rounded-full px-3 py-1 text-[11px] font-bold", i === 0 ? "bg-encre text-creme" : "bg-sable")}>
            {tab}
          </span>
        ))}
      </div>
      <ul className="flex flex-col gap-2 p-3">
        <DishRow
          code="10"
          name={s.dishes.chicken}
          price={`${s.prices.chickenHalf} / ${s.prices.chickenWhole}`}
          color="#B24A26"
          qty={frame.chicken}
          tapped={frame.tap === "chicken-add"}
        />
        <DishRow code="20" name={s.dishes.rice} price={s.prices.rice} color="#0F6B3E" qty={0} tapped={false} />
        <DishRow
          code="40"
          name={s.dishes.bissap}
          price={s.prices.bissap}
          color="#7a1f3d"
          qty={frame.bissap}
          tapped={frame.tap === "bissap-add"}
        />
      </ul>

      {/* Bottom bar: running total */}
      {itemCount > 0 && frame.customer === "menu" && (
        <div className="demo-slide-up absolute inset-x-3 bottom-4">
          <Tapped on={frame.tap === "open-sheet"} className="w-full">
            <span className="flex w-full items-center justify-between rounded-2xl bg-encre px-4 py-3 text-creme shadow-lg">
              <span className="text-sm font-bold">
                {s.ui.mySelection}
                <span className="ml-2 rounded-full bg-or px-2 py-0.5 text-xs text-encre">{itemCount}</span>
              </span>
              <span key={total} className="demo-bump text-sm font-extrabold tabular-nums">
                {total}
              </span>
            </span>
          </Tapped>
        </div>
      )}

      {/* Variant chooser */}
      {frame.variantOpen && (
        <Sheet title={s.ui.chooseVariant}>
          <div className="flex flex-col gap-2">
            <VariantButton label={s.ui.half} price={s.prices.chickenHalf} tapped={false} />
            <VariantButton label={s.ui.whole} price={s.prices.chickenWhole} tapped={frame.tap === "variant-whole"} />
          </div>
        </Sheet>
      )}

      {/* Ma sélection */}
      {frame.customer === "sheet" && (
        <Sheet title={s.ui.mySelection}>
          <ul className="mb-3 flex flex-col gap-2 text-sm">
            <li className="flex justify-between gap-2">
              <span>
                1 × {s.dishes.chicken} <span className="text-encre-2">({s.ui.whole})</span>
              </span>
              <span className="tabular-nums">{s.prices.chickenWhole}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span>2 × {s.dishes.bissap}</span>
              <span className="tabular-nums">{s.prices.bissapTwo}</span>
            </li>
          </ul>
          <p className="mb-3 flex justify-between border-t border-ligne pt-2 font-extrabold">
            <span>{s.ui.total}</span>
            <span className="tabular-nums">{total}</span>
          </p>
          <Tapped on={frame.tap === "show-server"} className="w-full">
            <span className="w-full rounded-xl bg-vert py-3 text-center text-sm font-bold text-creme">{s.ui.showServer}</span>
          </Tapped>
        </Sheet>
      )}
    </div>
  );
}

function DishRow({ code, name, price, color, qty, tapped }: { code: string; name: string; price: string; color: string; qty: number; tapped: boolean }) {
  return (
    <li className="flex items-center gap-2.5 rounded-xl bg-white p-2 shadow-sm">
      <span
        className="font-display flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold text-white"
        style={{ background: `linear-gradient(135deg, ${color}, #17231C)` }}
        aria-hidden
      >
        {code}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold">{name}</span>
        <span className="block text-[11px] text-encre-2 tabular-nums">{price}</span>
      </span>
      <Tapped on={tapped}>
        {qty > 0 ? (
          <span key={qty} className="demo-bump flex h-8 min-w-8 items-center justify-center rounded-full bg-vert px-2 text-sm font-bold text-creme">
            {qty}
          </span>
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-vert text-lg leading-none font-bold text-vert">+</span>
        )}
      </Tapped>
    </li>
  );
}

function Sheet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex items-end bg-black/40">
      <div className="demo-slide-up w-full rounded-t-3xl bg-creme p-4 pb-6">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ligne" aria-hidden />
        <p className="font-display mb-3 text-lg font-extrabold">{title}</p>
        {children}
      </div>
    </div>
  );
}

function VariantButton({ label, price, tapped }: { label: string; price: string; tapped: boolean }) {
  return (
    <Tapped on={tapped} className="w-full">
      <span
        className={cn(
          "flex w-full justify-between rounded-xl border-2 px-4 py-3 text-sm font-bold transition-colors",
          tapped ? "border-vert bg-vert/10" : "border-ligne bg-white",
        )}
      >
        <span>{label}</span>
        <span className="tabular-nums">{price}</span>
      </span>
    </Tapped>
  );
}

/* ---------- Server phone ---------- */

function ServerScreen({ s, frame, orderQr, itemCount, total }: { s: DemoStrings; frame: Frame; orderQr: string; itemCount: number; total: string }) {
  if (frame.server === "scan") {
    return (
      <div className="relative flex h-full flex-col items-center justify-center bg-[#2a2a28]">
        {/* The customer's phone, seen through the server's camera */}
        <div className="demo-float flex w-36 flex-col items-center gap-2 rounded-2xl border-4 border-encre bg-encre p-3 text-creme">
          <span className="rounded-lg bg-or px-3 text-encre">
            <span className="font-display text-2xl font-extrabold">7</span>
          </span>
          <div className="w-24 rounded-lg bg-white p-1" dangerouslySetInnerHTML={{ __html: orderQr }} />
        </div>
        <div className="pointer-events-none absolute inset-x-12 top-[150px] h-[190px] rounded-3xl border-4 border-or/90">
          <div className="demo-beam" />
        </div>
        <p className="absolute bottom-10 rounded-full bg-black/60 px-4 py-2 text-sm font-bold text-white">{s.ui.scanOrder}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-sable">
      <div className="bg-nuit px-4 pt-9 pb-3 text-creme">
        <p className="font-display text-lg font-extrabold">{s.server}</p>
        <p className="text-[11px] opacity-90">{s.ui.restaurant}</p>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3">
        {(frame.server === "order" || frame.server === "confirmed") && (
          <div className="demo-pop rounded-2xl bg-white p-3 shadow-md">
            <div className="mb-2 flex items-center justify-between">
              <span className="rounded-full bg-or px-2 py-0.5 text-[11px] font-bold text-encre">
                {frame.server === "confirmed" ? s.ui.confirmed : s.ui.newOrder}
              </span>
              <span className="text-[11px] text-encre-2">A-27</span>
            </div>
            <div className="mb-2 flex items-center gap-3">
              <span className="font-display flex h-14 w-14 flex-col items-center justify-center rounded-full bg-or leading-none text-encre shadow-inner">
                <span className="text-[9px] font-bold uppercase">{s.ui.table}</span>
                <span className="text-2xl font-extrabold">7</span>
              </span>
              <span className="text-xs">
                <span className="block">1 × {s.dishes.chicken}</span>
                <span className="block">2 × {s.dishes.bissap}</span>
              </span>
            </div>
            <p className="mb-2 flex justify-between text-sm font-extrabold">
              <span>{s.ui.itemsByCount[itemCount]}</span>
              <span className="tabular-nums">{total}</span>
            </p>
            {frame.server === "order" ? (
              <Tapped on={frame.tap === "confirm"} className="w-full">
                <span className="w-full rounded-xl bg-vert py-2.5 text-center text-sm font-bold text-creme">{s.ui.confirm}</span>
              </Tapped>
            ) : (
              <span className="block w-full rounded-xl bg-sable py-2.5 text-center text-sm font-bold text-vert">✓ {s.ui.confirmed}</span>
            )}
          </div>
        )}
        {frame.server === "idle" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-encre-2" aria-hidden>
            <span className="text-4xl">🛎️</span>
            <span className="h-2 w-24 rounded-full bg-ligne" />
            <span className="h-2 w-16 rounded-full bg-ligne" />
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Confetti (CSS only) ---------- */

const CONFETTI_COLORS = ["#E9B530", "#0F6B3E", "#B24A26", "#FFF8EC", "#2F7DD1"];

function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className="demo-confetti"
          style={{
            left: `${(i * 37) % 100}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${(i % 7) * 0.12}s`,
            animationDuration: `${1.8 + (i % 5) * 0.25}s`,
            transform: `rotate(${(i * 47) % 360}deg)`,
          }}
        />
      ))}
    </div>
  );
}
