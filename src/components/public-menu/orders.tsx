"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatFCFA } from "@/lib/format";
import type { makeT } from "@/lib/public-menu/translate";
import type { CartLine } from "@/lib/public-menu/types";
import { cn } from "@/lib/utils";
import { deviceId, type MySeat } from "./seating";

type T = ReturnType<typeof makeT>;
type Lang = "fr" | "en" | "zh";
type I18n = { fr: string } & Partial<Record<string, string>>;
const pick = (x: I18n | null | undefined, lang: Lang) => (x ? x[lang]?.trim() || x.fr : "");

/** Mirrors lib/orders/serialize publicOrder (kept here so the menu bundle has no server code). */
export type CustomerOrder = {
  id: string;
  number: number;
  status: "sent" | "confirmed" | "preparing" | "ready" | "served" | "paid" | "cancelled";
  mine: boolean;
  seat: { type: string; label: string } | null;
  customerName: string | null;
  subtotal: number;
  hasOnRequest: boolean;
  sentAt: string;
  servedAt: string | null;
  cancelledReason: string | null;
  items: Array<{
    id: string;
    itemId: string | null;
    variantId: string | null;
    optionIds: string[];
    code: string | null;
    name: I18n;
    variantName: I18n | null;
    options: I18n[];
    unitPrice: number | null;
    qty: number;
    note: string | null;
    status: string;
  }>;
};

const STEPS = ["sent", "confirmed", "preparing", "ready", "served"] as const;
const POLL_MS = 4000;

/**
 * Live orders of this phone (and its table): Server-Sent Events, with a 4-second polling
 * fallback while the stream is down. Also reports menu changes (sold out) and session events.
 */
export function useLiveOrders({
  slug,
  sessionId,
  active,
  onMenuChange,
  onSessionChange,
  onServed,
}: {
  slug: string;
  sessionId: string | null;
  active: boolean;
  onMenuChange: () => void;
  onSessionChange: () => void;
  onServed: (o: CustomerOrder) => void;
}) {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [shared, setShared] = useState(false);
  const known = useRef(new Map<string, CustomerOrder["status"]>());
  const cbs = useRef({ onMenuChange, onSessionChange, onServed });
  useEffect(() => {
    cbs.current = { onMenuChange, onSessionChange, onServed };
  }, [onMenuChange, onSessionChange, onServed]);

  const refresh = useCallback(async () => {
    const qs = new URLSearchParams({ slug, deviceId: deviceId(), ...(sessionId ? { sessionId } : {}) });
    const res = await fetch(`/api/public/orders?${qs}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const body = (await res.json()) as { orders: CustomerOrder[]; shared: boolean };
    for (const o of body.orders) {
      const before = known.current.get(o.id);
      if (o.mine && before && before !== "served" && o.status === "served") cbs.current.onServed(o);
      known.current.set(o.id, o.status);
    }
    setOrders(body.orders);
    setShared(body.shared);
  }, [slug, sessionId]);

  useEffect(() => {
    if (!active) return;
    void refresh();
    let es: EventSource | null = null;
    let poll: number | undefined;
    const startPolling = () => {
      if (poll === undefined) poll = window.setInterval(() => void refresh(), POLL_MS);
    };
    const stopPolling = () => {
      window.clearInterval(poll);
      poll = undefined;
    };
    if (typeof EventSource === "undefined") startPolling();
    else {
      const qs = new URLSearchParams({ slug, deviceId: deviceId(), ...(sessionId ? { sessionId } : {}) });
      es = new EventSource(`/api/public/stream?${qs}`);
      es.addEventListener("ready", () => {
        stopPolling();
        void refresh(); // catch up on anything missed while disconnected
      });
      es.addEventListener("order", () => void refresh());
      es.addEventListener("menu", () => cbs.current.onMenuChange());
      es.addEventListener("session", () => {
        cbs.current.onSessionChange();
        void refresh();
      });
      // The browser reconnects by itself; poll meanwhile so nothing is missed.
      es.onerror = startPolling;
    }
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    // Safety net: a live connection can stall silently on mobile networks.
    const safety = window.setInterval(() => document.visibilityState === "visible" && void refresh(), 20_000);
    return () => {
      es?.close();
      stopPolling();
      window.clearInterval(safety);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, refresh, slug, sessionId]);

  return { orders, shared, refresh, setOrders };
}

export type SendResult = { ok: true; order: CustomerOrder } | { ok: false; error: string; itemIds: string[] };

export async function sendOrder(
  slug: string,
  seat: MySeat,
  lines: CartLine[],
  extra: { customerName?: string; customerPhone?: string; deliveryAddress?: string },
): Promise<SendResult> {
  const res = await fetch("/api/public/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug,
      deviceId: deviceId(),
      sessionId: seat.sessionId,
      lines: lines.map((l) => ({ itemId: l.itemId, variantId: l.variantId, optionIds: l.optionIds, qty: l.qty, ...(l.note ? { note: l.note } : {}) })),
      ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v && v.trim())),
    }),
  }).catch(() => null);
  if (!res) return { ok: false, error: "network", itemIds: [] };
  const body = (await res.json().catch(() => ({}))) as { order?: CustomerOrder; error?: string; itemIds?: string[] };
  if (res.ok && body.order) return { ok: true, order: body.order };
  return { ok: false, error: res.status === 429 ? "rate_limited" : (body.error ?? "error"), itemIds: body.itemIds ?? [] };
}

/* ---------------------------------------------------------------- UI */

export function StatusSteps({ status, t }: { status: CustomerOrder["status"]; t: T }) {
  if (status === "cancelled") return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">{t("status_cancelled")}</p>;
  const at = status === "paid" ? STEPS.length - 1 : STEPS.indexOf(status as (typeof STEPS)[number]);
  return (
    <ol className="grid grid-cols-5 gap-1" aria-label={t("orderStatus")} data-testid="order-steps">
      {STEPS.map((s, i) => (
        <li key={s} className="flex flex-col items-center gap-1 text-center">
          <span
            className={cn("h-2 w-full rounded-full", i <= at ? "bg-[var(--accent)]" : "bg-muted")}
            aria-hidden
          />
          <span className={cn("text-[11px] leading-tight", i === at ? "font-bold" : "text-muted-foreground")} aria-current={i === at ? "step" : undefined}>
            {t(`status_${s}`)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function orderTotal(o: CustomerOrder, t: T) {
  return o.subtotal === 0 && o.hasOnRequest ? t("onRequest") : `${formatFCFA(o.subtotal)}${o.hasOnRequest ? " +" : ""}`;
}

export function OrdersList({
  orders,
  shared,
  lang,
  t,
  onShow,
}: {
  orders: CustomerOrder[];
  shared: boolean;
  lang: Lang;
  t: T;
  onShow: (o: CustomerOrder) => void;
}) {
  if (orders.length === 0) return <p className="py-6 text-center text-muted-foreground">{t("noOrders")}</p>;
  const live = orders.filter((o) => o.status !== "cancelled");
  const tableTotal = live.reduce((s, o) => s + o.subtotal, 0);
  const tableOnRequest = live.some((o) => o.hasOnRequest);
  return (
    <div className="flex flex-col gap-4">
      {shared && (
        <div className="rounded-xl bg-muted p-3" data-testid="table-bill">
          <p className="text-sm font-semibold">{t("tableBill")}</p>
          <p className="text-2xl font-extrabold tabular-nums">
            {tableTotal === 0 && tableOnRequest ? t("onRequest") : `${formatFCFA(tableTotal)}${tableOnRequest ? " +" : ""}`}
          </p>
          <p className="text-xs text-muted-foreground">{t("tableBillHint")}</p>
        </div>
      )}
      <ul className="flex flex-col gap-3">
        {orders.map((o) => (
          <li key={o.id} className="rounded-xl border border-border p-3" data-testid="my-order" data-status={o.status}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-bold">
                {t("orderNumber", { n: o.number })}
                {!o.mine && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{t("fromTable")}</span>}
              </p>
              <p className="font-bold tabular-nums">{orderTotal(o, t)}</p>
            </div>
            <StatusSteps status={o.status} t={t} />
            {o.status === "cancelled" && o.cancelledReason && <p className="mt-1 text-sm text-muted-foreground">{o.cancelledReason}</p>}
            <ul className="mt-2 text-sm">
              {o.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-2">
                  <span>
                    {i.qty} × {i.code && <span className="text-muted-foreground">{i.code}. </span>}
                    {pick(i.name, lang)}
                    {(i.variantName || i.options.length > 0) && (
                      <span className="text-muted-foreground"> ({[i.variantName && pick(i.variantName, lang), ...i.options.map((x) => pick(x, lang))].filter(Boolean).join(", ")})</span>
                    )}
                    {i.note && <span className="block text-xs italic text-muted-foreground">« {i.note} »</span>}
                  </span>
                </li>
              ))}
            </ul>
            {o.mine && o.status !== "cancelled" && (
              <button type="button" onClick={() => onShow(o)} className="mt-3 min-h-11 w-full rounded-xl border-2 border-[var(--accent)] font-bold" data-testid="show-server">
                📱 {t("showToServer")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Full-screen, high-contrast view the server reads (or scans) at the table. */
export function ShowToServer({ order, slug, lang, t, onClose }: { order: CustomerOrder; slug: string; lang: Lang; t: T; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  const qs = new URLSearchParams({ slug, deviceId: deviceId() });
  const seatText = order.seat ? `${t(`seat_${order.seat.type}`)} ${order.seat.type === "takeaway" || order.seat.type === "delivery" || order.seat.type === "counter" ? "" : order.seat.label}`.trim() : "";
  return (
    <div role="dialog" aria-modal="true" aria-label={t("showToServer")} className="fixed inset-0 z-[60] overflow-y-auto bg-black text-white" data-testid="server-view">
      <div className="mx-auto flex min-h-full max-w-lg flex-col gap-4 p-5" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-lg font-semibold text-white/80">{t("orderNumber", { n: order.number })}</p>
          <button ref={closeRef} type="button" onClick={onClose} className="min-h-11 rounded-full bg-white px-4 font-bold text-black">
            {t("close")}
          </button>
        </div>
        {seatText && (
          <p className="rounded-2xl bg-[#E9B530] px-4 py-3 text-center font-display text-5xl leading-none font-extrabold text-black" data-testid="server-seat">
            {seatText}
          </p>
        )}
        {order.customerName && <p className="text-center text-2xl font-bold">{order.customerName}</p>}
        <ul className="flex flex-col divide-y divide-white/20 text-2xl">
          {order.items.map((i) => (
            <li key={i.id} className="py-2">
              <span className="font-extrabold">{i.qty} ×</span> {i.code && <span className="text-[#E9B530]">{i.code}. </span>}
              {i.name.fr}
              {lang !== "fr" && pick(i.name, lang) !== i.name.fr && <span className="block text-base text-white/70">{pick(i.name, lang)}</span>}
              {(i.variantName || i.options.length > 0) && <span className="block text-base text-white/80">{[i.variantName?.fr, ...i.options.map((x) => x.fr)].filter(Boolean).join(", ")}</span>}
              {i.note && <span className="block text-base italic text-[#E9B530]">« {i.note} »</span>}
            </li>
          ))}
        </ul>
        <p className="text-right text-3xl font-extrabold tabular-nums">{orderTotal(order, t)}</p>
        <div className="mx-auto rounded-2xl bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- server-made SVG, no QR library on the phone */}
          <img src={`/api/public/orders/${order.id}/qr?${qs}`} alt={t("orderQrAlt")} width={200} height={200} className="h-50 w-50" />
        </div>
        <p className="text-center text-sm text-white/70">{t("orderQrHint")}</p>
      </div>
    </div>
  );
}

/** « Vous avez été servi ! Bon appétit » with confetti (none when the phone asks for less motion). */
export function ServedCelebration({ t, onClose }: { t: T; onClose: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onClose, 4000);
    return () => window.clearTimeout(id);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={t("served")} onClick={onClose} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-6" data-testid="served">
      <div className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden" aria-hidden>
        {Array.from({ length: 36 }, (_, i) => (
          <span
            key={i}
            className="demo-confetti"
            style={{
              left: `${(i * 29) % 100}%`,
              background: ["#E9B530", "#0F6B3E", "#B24A26", "#FFF8EC", "#2F7DD1"][i % 5],
              animationDelay: `${(i % 9) * 0.1}s`,
              animationDuration: `${1.8 + (i % 5) * 0.3}s`,
            }}
          />
        ))}
      </div>
      <div className="demo-pop relative max-w-sm rounded-3xl bg-background p-8 text-center shadow-2xl">
        <p className="text-5xl" aria-hidden>
          🎉
        </p>
        <p className="font-display mt-2 text-2xl leading-tight font-extrabold">{t("served")}</p>
        <p className="mt-2 text-muted-foreground">{t("servedSub")}</p>
      </div>
    </div>
  );
}

/** Extra details some seats need before sending (takeaway name, delivery address and phone). */
export function OrderDetailsFields({
  seat,
  t,
  values,
  onChange,
}: {
  seat: MySeat;
  t: T;
  values: { customerName: string; customerPhone: string; deliveryAddress: string };
  onChange: (v: Partial<{ customerName: string; customerPhone: string; deliveryAddress: string }>) => void;
}) {
  const type = seat.seat.type;
  if (type !== "takeaway" && type !== "delivery" && !(type === "counter" && !seat.name)) return null;
  const input = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base";
  return (
    <div className="mt-3 grid gap-2" data-testid="order-details">
      <label className="text-sm font-semibold">
        {t("yourName")}
        <input value={values.customerName} onChange={(e) => onChange({ customerName: e.target.value })} maxLength={40} autoComplete="given-name" className={input} />
      </label>
      {type === "delivery" && (
        <>
          <label className="text-sm font-semibold">
            {t("phone")}
            <input value={values.customerPhone} onChange={(e) => onChange({ customerPhone: e.target.value })} inputMode="tel" autoComplete="tel" placeholder="70 12 34 56" className={input} />
          </label>
          <label className="text-sm font-semibold">
            {t("deliveryAddress")}
            <textarea value={values.deliveryAddress} onChange={(e) => onChange({ deliveryAddress: e.target.value })} maxLength={200} rows={2} className={input + " py-2"} />
          </label>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- « Sélections précédentes » */

export type HistoryEntry = { id: string; at: string; kind: "cart" | "order"; number?: number; lines: CartLine[] };
const MAX_HISTORY = 12;

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked */
  }
}

/** Past selections live on this phone only (localStorage). */
export function useHistory(slug: string, isLine: (x: unknown) => x is CartLine) {
  const key = `rc-history-${slug}`;
  const lastKey = `rc-lastcart-${slug}`;
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const save = useCallback(
    (list: HistoryEntry[]) => {
      const trimmed = list.slice(0, MAX_HISTORY);
      setEntries(trimmed);
      writeJson(key, trimmed);
    },
    [key],
  );
  const clean = useCallback(
    (raw: unknown): HistoryEntry[] =>
      Array.isArray(raw)
        ? raw
            .filter((e): e is HistoryEntry => !!e && typeof e === "object" && typeof (e as HistoryEntry).id === "string" && Array.isArray((e as HistoryEntry).lines))
            .map((e) => ({ ...e, lines: e.lines.filter(isLine) }))
            .filter((e) => e.lines.length > 0)
        : [],
    [isLine],
  );
  /** On a new visit: the cart left last time becomes a « previous selection ». */
  const startVisit = useCallback(
    (newVisit: boolean) => {
      let list = clean(readJson<unknown>(key, []));
      if (newVisit) {
        const last = clean([{ id: "x", at: "", kind: "cart", lines: readJson<unknown>(lastKey, []) }])[0];
        if (last) list = [{ ...last, id: `c${Date.now()}`, at: new Date().toISOString() }, ...list];
        writeJson(lastKey, null);
      }
      save(list);
    },
    [clean, key, lastKey, save],
  );
  const rememberCart = useCallback((lines: CartLine[]) => writeJson(lastKey, lines.length ? lines : null), [lastKey]);
  const addOrder = useCallback(
    (number: number, lines: CartLine[]) => save([{ id: `o${Date.now()}`, at: new Date().toISOString(), kind: "order", number, lines }, ...entries]),
    [entries, save],
  );
  const remove = useCallback((id: string) => save(entries.filter((e) => e.id !== id)), [entries, save]);
  return { entries, startVisit, rememberCart, addOrder, remove };
}

export function HistoryList({
  entries,
  lang,
  t,
  describe,
  onReuse,
  onDelete,
}: {
  entries: HistoryEntry[];
  lang: Lang;
  t: T;
  describe: (l: CartLine) => string | null;
  onReuse: (e: HistoryEntry) => void;
  onDelete: (id: string) => void;
}) {
  if (entries.length === 0) return <p className="py-6 text-center text-muted-foreground">{t("noHistory")}</p>;
  const fmt = new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : lang, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Ouagadougou" });
  return (
    <ul className="flex flex-col gap-3">
      {entries.map((e) => {
        const names = e.lines.map(describe).filter(Boolean) as string[];
        return (
          <li key={e.id} className="rounded-xl border border-border p-3" data-testid="history-entry">
            <p className="text-sm font-semibold">
              {e.kind === "order" ? t("historyOrder", { n: e.number ?? 0 }) : t("historyCart")} · <span className="font-normal text-muted-foreground">{e.at ? fmt.format(new Date(e.at)) : ""}</span>
            </p>
            <p className="mt-1 text-sm">{names.length ? names.join(", ") : t("historyGone")}</p>
            <div className="mt-2 flex gap-2">
              {names.length > 0 && (
                <button type="button" onClick={() => onReuse(e)} className="min-h-11 flex-1 rounded-xl font-bold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
                  {t("reuse")}
                </button>
              )}
              <button type="button" onClick={() => onDelete(e.id)} className="min-h-11 rounded-xl border border-border px-4 font-semibold">
                {t("delete")}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
