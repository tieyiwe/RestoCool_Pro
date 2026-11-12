"use client";

import { useLocale, useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { formatFCFA } from "@/lib/format";
import type { StaffOrder } from "@/lib/orders/serialize";
import { cn } from "@/lib/utils";

type I18n = { fr: string } & Partial<Record<string, string>>;
const pick = (x: I18n | null | undefined, locale: string) => (x ? x[locale]?.trim() || x.fr : "");
export type Delays = { warnMin: number; lateMin: number };

/** What the signed-in person may do to an order (from can() on the server): buttons follow it. */
export type OrderPerms = { confirm: boolean; prepare: boolean; serve: boolean; cancel: boolean };
const ALL: OrderPerms = { confirm: true, prepare: true, serve: true, cancel: true };
const PermsContext = createContext<OrderPerms>(ALL);
export function OrderPermsProvider({ perms, children }: { perms: OrderPerms; children: React.ReactNode }) {
  return <PermsContext.Provider value={perms}>{children}</PermsContext.Provider>;
}
const POLL_MS = 4000;
const STATIONS = ["grill", "wok", "kitchen", "drinks", "desserts"] as const;

function store(key: string, value?: string | null): string | null {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked */
  }
  return null;
}

/* ---------------------------------------------------------------- live data */

/**
 * Orders of the member's restaurant, live (SSE) with polling while the stream is down.
 * `onNew` runs for an order that appeared or changed status since the last refresh (`before`:
 * its previous status, undefined when it is new), never on the first load.
 */
export function useServiceOrders(onNew: (o: StaffOrder, before: StaffOrder["status"] | undefined) => void) {
  const [orders, setOrders] = useState<StaffOrder[] | null>(null);
  const [error, setError] = useState<"plan" | "network" | null>(null);
  const [connected, setConnected] = useState(false);
  const [menuTick, setMenuTick] = useState(0);
  const seen = useRef<Map<string, StaffOrder["status"]> | null>(null);
  const onNewRef = useRef(onNew);
  useEffect(() => {
    onNewRef.current = onNew;
  }, [onNew]);

  // One refresh per live event: answers can arrive out of order, and an older one must not
  // put an order back to a previous status (or ring twice for it).
  const seq = useRef(0);
  const applied = useRef(0);
  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    const res = await fetch("/api/app/orders", { cache: "no-store" }).catch(() => null);
    if (mine < applied.current) return;
    if (!res) return setError("network");
    if (res.status === 402 || res.status === 403) return setError("plan");
    if (!res.ok) return setError("network");
    const body = (await res.json().catch(() => null)) as { orders: StaffOrder[] } | null;
    if (!body) return setError("network");
    if (mine < applied.current) return;
    applied.current = mine;
    setError(null);
    if (seen.current) for (const o of body.orders) if (seen.current.get(o.id) !== o.status) onNewRef.current(o, seen.current.get(o.id));
    seen.current = new Map(body.orders.map((o) => [o.id, o.status]));
    setOrders(body.orders);
  }, []);

  useEffect(() => {
    void refresh();
    let poll: number | undefined;
    const startPolling = () => {
      setConnected(false);
      if (poll === undefined) poll = window.setInterval(() => void refresh(), POLL_MS);
    };
    const es = typeof EventSource === "undefined" ? null : new EventSource("/api/app/stream");
    if (!es) startPolling();
    else {
      es.addEventListener("ready", () => {
        setConnected(true);
        window.clearInterval(poll);
        poll = undefined;
        void refresh();
      });
      es.addEventListener("order", () => void refresh());
      es.addEventListener("session", () => void refresh());
      es.addEventListener("menu", () => setMenuTick((n) => n + 1));
      es.onerror = startPolling;
    }
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    // Safety net: a live connection can stall silently (tablet on a weak network).
    const safety = window.setInterval(() => void refresh(), 20_000);
    return () => {
      es?.close();
      window.clearInterval(poll);
      window.clearInterval(safety);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return { orders, error, connected, refresh, menuTick };
}

/** Elapsed-time clock for the timers (one tick every 15 s is enough). */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** Keep the tablet's screen on (kiosk use) where the browser allows it. */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const request = () =>
      navigator.wakeLock
        .request("screen")
        .then((l) => (lock = l))
        .catch(() => {});
    void request();
    const onVisible = () => document.visibilityState === "visible" && void request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => {});
    };
  }, [on]);
}

/** Short two-tone chime (no audio file to download) and a vibration where supported. */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      [880, 1175].forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
        g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + i * 0.18 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.3);
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + i * 0.18);
        o.stop(ctx.currentTime + i * 0.18 + 0.32);
      });
      window.setTimeout(() => void ctx.close(), 1000);
    }
  } catch {
    /* no sound */
  }
  navigator.vibrate?.([200, 100, 200]);
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!res) return { ok: false, error: "network" };
  if (res.ok) return { ok: true };
  const b = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: b.error ?? "error" };
}

/* ---------------------------------------------------------------- pieces */

const SEAT_STYLE: Record<string, string> = {
  table: "rounded-full bg-[#E9B530] text-[#17231C] ring-4 ring-[#F6D77A]",
  room: "rounded-xl bg-[#9E2B25] text-[#FFF8EC] ring-4 ring-[#C9584F]",
  area: "rounded-xl bg-[#2F7DD1] text-white",
  counter: "rounded-lg bg-[#17231C] text-[#FFF8EC]",
  takeaway: "rounded-r-full rounded-l-md bg-[#0F6B3E] text-white",
  delivery: "rounded-r-full rounded-l-md bg-[#B24A26] text-white",
};

/** Large, distinctive seat badge (gold coin for tables, red lacquer for rooms, green tag for takeaway…). */
export function SeatBadgeLarge({ seat, name }: { seat: StaffOrder["seat"]; name: string | null }) {
  const t = useTranslations("service");
  if (!seat) return null;
  const showLabel = seat.type === "table" || seat.type === "room" || seat.type === "area";
  return (
    <span className={cn("inline-flex min-h-14 min-w-14 items-center justify-center px-3 font-display text-2xl leading-none font-extrabold", SEAT_STYLE[seat.type])} data-testid="seat-big">
      {showLabel ? seat.label : t(`seat.${seat.type}`)}
      {!showLabel && name ? <span className="ml-2 text-base font-bold">· {name}</span> : null}
    </span>
  );
}

function Elapsed({ since, now, delays }: { since: string; now: number; delays: Delays }) {
  const t = useTranslations("service");
  const min = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
  const tone = min >= delays.lateMin ? "bg-red-600 text-white" : min >= delays.warnMin ? "bg-orange-500 text-white" : "bg-muted";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-sm font-bold tabular-nums", tone)} data-testid="elapsed">
      {t("minutes", { n: min })}
    </span>
  );
}

function CancelForm({ onCancel, onClose }: { onCancel: (reason: string) => void; onClose: () => void }) {
  const t = useTranslations("service");
  const [reason, setReason] = useState("");
  const reasons = [t("reason.customer"), t("reason.soldOut"), t("reason.mistake")];
  return (
    <div className="mt-2 rounded-lg border border-red-300 bg-red-50 p-2 text-red-950" data-testid="cancel-form">
      <p className="text-sm font-semibold">{t("cancelWhy")}</p>
      <div className="my-2 flex flex-wrap gap-1">
        {reasons.map((r) => (
          <button key={r} type="button" onClick={() => setReason(r)} className={cn("min-h-11 rounded-full border px-3 text-sm", reason === r ? "border-red-700 bg-red-700 text-white" : "border-red-300 bg-white")}>
            {r}
          </button>
        ))}
      </div>
      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} aria-label={t("cancelWhy")} className="min-h-11 w-full rounded-lg border border-red-300 bg-white px-2 text-base" />
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={!reason.trim()} onClick={() => onCancel(reason.trim())} className="min-h-11 flex-1 rounded-lg bg-red-700 font-bold text-white disabled:opacity-50">
          {t("cancelConfirm")}
        </button>
        <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-red-300 bg-white px-3 font-semibold">
          {t("back")}
        </button>
      </div>
    </div>
  );
}

/** One order on the front desk (or the detail page opened from the customer's QR). */
export function OrderCard({ order, now, delays, onChanged, big = false }: { order: StaffOrder; now: number; delays: Delays; onChanged: () => void; big?: boolean }) {
  const t = useTranslations("service");
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const move = async (to: string, reason?: string) => {
    setBusy(true);
    const r = await post(`/api/app/orders/${order.id}/status`, { to, reason });
    setBusy(false);
    setCancelling(false);
    setMsg(r.ok ? null : t(r.error === "conflict" ? "conflict" : r.error === "forbidden" ? "forbidden" : "actionError"));
    onChanged();
  };
  const perms = useContext(PermsContext);
  // The next step this person can do: a server who doesn't prepare dishes serves a confirmed order.
  const ready = { to: "ready", label: t("markReady") };
  const served = { to: "served", label: t("markServed") };
  const next: Partial<Record<StaffOrder["status"], { to: string; label: string } | null>> = {
    sent: perms.confirm ? { to: "confirmed", label: t("confirm") } : null,
    confirmed: perms.prepare ? ready : perms.serve ? served : null,
    preparing: perms.prepare ? ready : perms.serve ? served : null,
    ready: perms.serve ? served : null,
  };
  const action = next[order.status];
  const done = order.status === "served" || order.status === "cancelled" || order.status === "paid";
  return (
    <article className={cn("flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3 shadow-sm", order.status === "sent" && "border-2 border-[#E9B530]", done && "opacity-70")} data-testid="order-card" data-status={order.status} data-number={order.number}>
      <header className="flex items-start justify-between gap-2">
        <SeatBadgeLarge seat={order.seat} name={order.customerName} />
        <div className="flex flex-col items-end gap-1">
          <span className="text-sm font-bold">{t("number", { n: order.number })}</span>
          {!done && <Elapsed since={order.sentAt} now={now} delays={delays} />}
        </div>
      </header>
      {order.area && <p className="text-xs font-semibold text-muted-foreground">{pick(order.area.name, locale)}</p>}
      {order.deliveryAddress && (
        <p className="text-sm">
          📍 {order.deliveryAddress} · {order.customerPhone}
        </p>
      )}
      <ul className={cn("flex flex-col gap-1", big ? "text-lg" : "text-sm")}>
        {order.items.map((i) => (
          <li key={i.id} className={cn(i.status === "cancelled" && "line-through opacity-60")}>
            <span className="font-bold">{i.qty} ×</span> {i.code && <span className="text-muted-foreground">{i.code}. </span>}
            {i.name.fr}
            {locale !== "fr" && pick(i.name, locale) !== i.name.fr && <span className="text-muted-foreground"> · {pick(i.name, locale)}</span>}
            {(i.variantName || i.options.length > 0) && <span className="text-muted-foreground"> ({[i.variantName?.fr, ...i.options.map((o) => o.fr)].filter(Boolean).join(", ")})</span>}
            {i.note && <span className="block text-sm font-semibold text-orange-700 italic dark:text-orange-300">« {i.note} »</span>}
            {i.status === "ready" && order.status !== "ready" && order.status !== "served" && <span className="ml-1 text-xs font-bold text-emerald-700">✓</span>}
          </li>
        ))}
      </ul>
      {order.note && <p className="text-sm italic">« {order.note} »</p>}
      <p className="flex justify-between border-t border-border pt-2 text-sm font-bold">
        <span>{t(`status.${order.status}`)}</span>
        <span className="tabular-nums">{order.subtotal === 0 && order.hasOnRequest ? t("onRequest") : `${formatFCFA(order.subtotal)}${order.hasOnRequest ? " +" : ""}`}</span>
      </p>
      <HandledBy order={order} />
      {msg && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          {msg}
        </p>
      )}
      {!done && (
        <div className="flex gap-2">
          {action && (
            <button type="button" disabled={busy} onClick={() => void move(action.to)} className="min-h-12 flex-1 rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-60" data-testid={`action-${action.to}`}>
              {action.label}
            </button>
          )}
          {!cancelling && perms.cancel && (
            <button type="button" disabled={busy} onClick={() => setCancelling(true)} className="min-h-12 rounded-xl border border-border px-3 text-sm font-semibold" data-testid="action-cancel">
              {t("cancel")}
            </button>
          )}
        </div>
      )}
      {cancelling && <CancelForm onCancel={(r) => void move("cancelled", r)} onClose={() => setCancelling(false)} />}
    </article>
  );
}

/** Who handled each step, with their matricule (« Confirmée par Awa · 002 »). */
function HandledBy({ order }: { order: StaffOrder }) {
  const t = useTranslations("service");
  const steps = (["confirmed", "prepared", "served", "cancelled"] as const).filter((k) => order.handledBy[k]);
  if (steps.length === 0) return null;
  return (
    <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground" data-testid="handled-by">
      {steps.map((k) => (
        <li key={k}>
          {t(`by.${k}`, { name: order.handledBy[k]!.name, no: order.handledBy[k]!.staffNo })}
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- sold out */

type SoldOutItem = { id: string; code: string | null; name: I18n; category: I18n; soldOut: boolean; note: string | null };

/** « Épuisé » in one tap; customers' menus update live. */
export function SoldOutPanel({ tick, onClose }: { tick: number; onClose: () => void }) {
  const t = useTranslations("service");
  const locale = useLocale();
  const [items, setItems] = useState<SoldOutItem[] | null>(null);
  const [q, setQ] = useState("");
  const load = useCallback(async () => {
    const res = await fetch("/api/app/sold-out", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setItems(((await res.json()) as { items: SoldOutItem[] }).items);
  }, []);
  useEffect(() => {
    void load();
  }, [load, tick]);
  const toggle = async (it: SoldOutItem) => {
    setItems((list) => list?.map((x) => (x.id === it.id ? { ...x, soldOut: !x.soldOut, note: null } : x)) ?? null);
    const r = await post("/api/app/sold-out", { itemId: it.id, soldOut: !it.soldOut });
    if (!r.ok) void load();
  };
  /** Short note for customers while sold out (saved when the field loses focus or a suggestion is tapped). */
  const saveNote = async (it: SoldOutItem, note: string) => {
    setItems((list) => list?.map((x) => (x.id === it.id ? { ...x, note } : x)) ?? null);
    const r = await post("/api/app/sold-out", { itemId: it.id, soldOut: true, note });
    if (!r.ok) void load();
  };
  const shown = (items ?? []).filter((i) => !q.trim() || `${i.code ?? ""} ${pick(i.name, locale)} ${i.name.fr}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div role="dialog" aria-modal="true" aria-label={t("soldOutTitle")} className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose} data-testid="sold-out-panel">
      <div className="flex h-full w-full max-w-md flex-col bg-background p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">{t("soldOutTitle")}</h2>
          <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-border px-3 font-semibold">
            {t("close")}
          </button>
        </div>
        <p className="mb-2 text-sm text-muted-foreground">{t("soldOutHint")}</p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="mb-3 min-h-11 rounded-lg border border-border bg-surface px-3 text-base" />
        <ul className="flex-1 divide-y divide-border overflow-y-auto">
          {items === null && <li className="py-4 text-center text-muted-foreground">{t("loading")}</li>}
          {shown.map((i) => (
            <li key={i.id}>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 py-1">
                <input type="checkbox" checked={i.soldOut} onChange={() => void toggle(i)} className="h-6 w-6" data-testid="sold-out-toggle" />
                <span className={cn("flex-1", i.soldOut && "font-bold text-red-700")}>
                  {i.code && <span className="text-muted-foreground">{i.code}. </span>}
                  {pick(i.name, locale)}
                </span>
                {i.soldOut && <span className="rounded-full bg-red-100 px-2 text-xs font-bold text-red-900">{t("soldOut")}</span>}
              </label>
            {i.soldOut && <NoteField item={i} onSave={saveNote} />}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Note shown to customers under « Épuisé » (« De retour demain »), with quick suggestions. */
function NoteField({ item, onSave }: { item: SoldOutItem; onSave: (it: SoldOutItem, note: string) => void }) {
  const t = useTranslations("service");
  const [value, setValue] = useState(item.note ?? "");
  const suggestions = [t("noteTomorrow"), t("noteTonight"), t("noteSoon")];
  return (
    <div className="mb-2 flex flex-col gap-1 pl-9" data-testid="sold-out-note-field">
      <input
        value={value}
        maxLength={80}
        placeholder={t("notePlaceholder")}
        aria-label={`${t("noteLabel")} · ${item.name.fr}`}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => value !== (item.note ?? "") && onSave(item, value)}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="min-h-11 rounded-lg border border-border bg-surface px-2 text-base"
      />
      <div className="flex flex-wrap gap-1">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setValue(s);
              onSave(item, s);
            }}
            className="min-h-9 rounded-full border border-border px-2.5 text-xs font-semibold hover:bg-muted"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- toolbar */

function Toolbar({ connected, sound, setSound, wake, setWake, onSoldOut, children }: { connected: boolean; sound: boolean; setSound: (b: boolean) => void; wake: boolean; setWake: (b: boolean) => void; onSoldOut: () => void; children?: React.ReactNode }) {
  const t = useTranslations("service");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={cn("rounded-full px-3 py-1 text-xs font-bold", connected ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900")} role="status" data-testid="live-status">
        {connected ? `● ${t("live")}` : `○ ${t("polling")}`}
      </span>
      {children}
      <button type="button" onClick={() => setSound(!sound)} aria-pressed={sound} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold">
        {sound ? "🔔" : "🔕"} {t("sound")}
      </button>
      <button type="button" onClick={() => setWake(!wake)} aria-pressed={wake} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold">
        {wake ? "☀️" : "🌙"} {t("screenOn")}
      </button>
      <button type="button" onClick={onSoldOut} className="min-h-11 rounded-lg bg-red-700 px-3 text-sm font-bold text-white" data-testid="open-sold-out">
        {t("soldOutButton")}
      </button>
    </div>
  );
}

function usePref(key: string, initial: boolean): [boolean, (b: boolean) => void] {
  const [v, setV] = useState(initial);
  useEffect(() => {
    const s = store(key);
    if (s !== null) setV(s === "1");
  }, [key]);
  return [v, (b: boolean) => {
    setV(b);
    store(key, b ? "1" : "0");
  }];
}

function BoardError({ error }: { error: "plan" | "network" }) {
  const t = useTranslations("service");
  return (
    <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-950">
      {t(error === "plan" ? "planRequired" : "networkError")}
    </p>
  );
}

/* ---------------------------------------------------------------- front desk */

export function FrontDesk({ delays }: { delays: Delays }) {
  const t = useTranslations("service");
  const locale = useLocale();
  const [sound, setSound] = usePref("rc-fd-sound", true);
  const [wake, setWake] = usePref("rc-fd-wake", false);
  const [soldOut, setSoldOut] = useState(false);
  const [area, setArea] = useState<string>("all");
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);
  const onNew = useCallback((o: StaffOrder, before: StaffOrder["status"] | undefined) => {
    if (soundRef.current && before === undefined && (o.status === "sent" || o.status === "confirmed")) chime();
  }, []);
  const { orders, error, connected, refresh, menuTick } = useServiceOrders(onNew);
  useWakeLock(wake);
  const now = useNow();
  const areas = useMemo(() => {
    const m = new Map<string, I18n>();
    for (const o of orders ?? []) if (o.area) m.set(o.area.id, o.area.name);
    return [...m.entries()];
  }, [orders]);
  const visible = (orders ?? []).filter((o) => area === "all" || o.area?.id === area || (area === "none" && !o.area));
  const columns: Array<{ key: string; title: string; list: StaffOrder[] }> = [
    { key: "new", title: t("col.new"), list: visible.filter((o) => o.status === "sent") },
    { key: "kitchen", title: t("col.kitchen"), list: visible.filter((o) => o.status === "confirmed" || o.status === "preparing") },
    { key: "ready", title: t("col.ready"), list: visible.filter((o) => o.status === "ready") },
    { key: "served", title: t("col.served"), list: visible.filter((o) => o.status === "served").reverse() },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">{t("frontDesk")}</h1>
        <Toolbar connected={connected} sound={sound} setSound={setSound} wake={wake} setWake={setWake} onSoldOut={() => setSoldOut(true)}>
          {areas.length > 0 && (
            <select value={area} onChange={(e) => setArea(e.target.value)} aria-label={t("filterArea")} className="min-h-11 rounded-lg border border-border bg-surface px-2 text-base">
              <option value="all">{t("allAreas")}</option>
              {areas.map(([id, name]) => (
                <option key={id} value={id}>
                  {pick(name, locale)}
                </option>
              ))}
              <option value="none">{t("noArea")}</option>
            </select>
          )}
        </Toolbar>
      </div>
      {error && <BoardError error={error} />}
      {orders === null && !error && <p className="text-muted-foreground">{t("loading")}</p>}
      {orders !== null && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {columns.map((c) => (
            <section key={c.key} aria-labelledby={`col-${c.key}`} className="flex flex-col gap-3 rounded-2xl bg-muted/50 p-2" data-testid={`col-${c.key}`}>
              <h2 id={`col-${c.key}`} className="flex items-center justify-between px-1 font-bold">
                {c.title} <span className="rounded-full bg-surface px-2 text-sm">{c.list.length}</span>
              </h2>
              {c.list.length === 0 && <p className="px-1 py-4 text-center text-sm text-muted-foreground">{t("emptyColumn")}</p>}
              {c.list.map((o) => (
                <OrderCard key={o.id} order={o} now={now} delays={delays} onChanged={() => void refresh()} />
              ))}
            </section>
          ))}
        </div>
      )}
      {soldOut && <SoldOutPanel tick={menuTick} onClose={() => setSoldOut(false)} />}
    </div>
  );
}

/* ---------------------------------------------------------------- kitchen display */

export function KitchenDisplay({ delays }: { delays: Delays }) {
  const t = useTranslations("service");
  const locale = useLocale();
  const [sound, setSound] = usePref("rc-kds-sound", true);
  const [wake, setWake] = usePref("rc-kds-wake", true);
  const [soldOut, setSoldOut] = useState(false);
  const [station, setStation] = useState<string>("all");
  useEffect(() => {
    const s = store("rc-kds-station");
    if (s) setStation(s);
  }, []);
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);
  // An order reaches the kitchen when it becomes « confirmée »: straight away in direct mode,
  // or when the server confirms it (it was already on the board as « envoyée »).
  const onNew = useCallback((o: StaffOrder, before: StaffOrder["status"] | undefined) => {
    if (soundRef.current && o.status === "confirmed" && (before === undefined || before === "sent")) chime();
  }, []);
  const { orders, error, connected, refresh, menuTick } = useServiceOrders(onNew);
  useWakeLock(wake);
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);

  const cook = (orders ?? []).filter((o) => o.status === "confirmed" || o.status === "preparing");
  const shown = cook
    .map((o) => ({ ...o, items: o.items.filter((i) => i.status !== "cancelled" && (station === "all" || i.station === station)) }))
    .filter((o) => o.items.length > 0);
  const ready = (orders ?? []).filter((o) => o.status === "ready");

  const tapItem = async (orderId: string, itemId: string, status: string) => {
    const nextStatus = status === "pending" ? "preparing" : status === "preparing" ? "ready" : "pending";
    setBusy(itemId);
    await post(`/api/app/orders/${orderId}/items/${itemId}`, { status: nextStatus });
    setBusy(null);
    void refresh();
  };
  const allReady = async (o: (typeof shown)[number]) => {
    setBusy(o.id);
    // With a station filter, only this station's dishes; otherwise the whole order.
    if (station === "all") await post(`/api/app/orders/${o.id}/status`, { to: "ready" });
    else for (const i of o.items.filter((x) => x.status !== "ready")) await post(`/api/app/orders/${o.id}/items/${i.id}`, { status: "ready" });
    setBusy(null);
    void refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">{t("kitchen")}</h1>
        <Toolbar connected={connected} sound={sound} setSound={setSound} wake={wake} setWake={setWake} onSoldOut={() => setSoldOut(true)} />
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("station")}>
        {["all", ...STATIONS].map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={station === s}
            onClick={() => {
              setStation(s);
              store("rc-kds-station", s);
            }}
            className={cn("min-h-11 rounded-full border px-4 text-sm font-semibold", station === s ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface")}
          >
            {s === "all" ? t("allStations") : t(`stations.${s}`)}
          </button>
        ))}
      </div>
      {error && <BoardError error={error} />}
      {orders === null && !error && <p className="text-muted-foreground">{t("loading")}</p>}
      {orders !== null && shown.length === 0 && <p className="rounded-2xl bg-muted p-8 text-center text-lg text-muted-foreground">{t("kitchenEmpty")}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((o) => (
          <article key={o.id} className="flex flex-col gap-3 rounded-2xl border-2 border-border bg-surface p-3" data-testid="kds-card" data-number={o.number}>
            <header className="flex items-start justify-between gap-2">
              <SeatBadgeLarge seat={o.seat} name={o.customerName} />
              <div className="flex flex-col items-end gap-1">
                <span className="font-bold">{t("number", { n: o.number })}</span>
                <Elapsed since={o.confirmedAt ?? o.sentAt} now={now} delays={delays} />
              </div>
            </header>
            <ul className="flex flex-col gap-2">
              {o.items.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    disabled={busy === i.id}
                    onClick={() => void tapItem(o.id, i.id, i.status)}
                    className={cn(
                      "flex min-h-14 w-full items-start gap-3 rounded-xl border-2 p-2 text-left text-lg",
                      i.status === "ready" ? "border-emerald-600 bg-emerald-50 text-emerald-950" : i.status === "preparing" ? "border-orange-500 bg-orange-50 text-orange-950" : "border-border",
                    )}
                    data-testid="kds-item"
                    data-status={i.status}
                  >
                    <span className="text-2xl font-extrabold">{i.qty}×</span>
                    <span className="flex-1">
                      {i.code && <span className="opacity-70">{i.code}. </span>}
                      <span className="font-bold">{i.name.fr}</span>
                      {locale !== "fr" && pick(i.name, locale) !== i.name.fr && <span className="block text-sm opacity-80">{pick(i.name, locale)}</span>}
                      {(i.variantName || i.options.length > 0) && <span className="block text-base">{[i.variantName?.fr, ...i.options.map((x) => x.fr)].filter(Boolean).join(", ")}</span>}
                      {i.note && <span className="block text-base font-bold italic">« {i.note} »</span>}
                    </span>
                    <span className="text-sm font-bold">{t(`item.${i.status}`)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" disabled={busy === o.id} onClick={() => void allReady(o)} className="min-h-12 rounded-xl bg-emerald-700 font-bold text-white disabled:opacity-60" data-testid="kds-all-ready">
              ✓ {t("allReady")}
            </button>
          </article>
        ))}
      </div>
      {ready.length > 0 && (
        <p className="rounded-xl bg-emerald-50 p-3 text-emerald-950" data-testid="kds-waiting">
          {t("waitingService", { count: ready.length })}: {ready.map((o) => t("number", { n: o.number })).join(", ")}
        </p>
      )}
      {soldOut && <SoldOutPanel tick={menuTick} onClose={() => setSoldOut(false)} />}
    </div>
  );
}

/* ---------------------------------------------------------------- one order (from the QR) */

export function OrderDetail({ initial, delays }: { initial: StaffOrder; delays: Delays }) {
  const [order, setOrder] = useState(initial);
  const now = useNow();
  const reload = useCallback(async () => {
    const res = await fetch(`/api/app/orders/${initial.id}`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setOrder(((await res.json()) as { order: StaffOrder }).order);
  }, [initial.id]);
  useEffect(() => {
    // Same live rules as the board: catch up when the stream (re)connects, poll while it is down.
    let poll: number | undefined;
    const startPolling = () => {
      if (poll === undefined) poll = window.setInterval(() => void reload(), POLL_MS);
    };
    const es = typeof EventSource === "undefined" ? null : new EventSource("/api/app/stream");
    if (!es) startPolling();
    else {
      es.addEventListener("ready", () => {
        window.clearInterval(poll);
        poll = undefined;
        void reload();
      });
      es.addEventListener("order", () => void reload());
      es.onerror = startPolling;
    }
    const onVisible = () => document.visibilityState === "visible" && void reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      es?.close();
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);
  return (
    <div className="mx-auto max-w-lg">
      <OrderCard order={order} now={now} delays={delays} onChanged={() => void reload()} big />
    </div>
  );
}
