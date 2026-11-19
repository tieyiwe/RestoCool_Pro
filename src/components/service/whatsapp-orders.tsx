"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { formatFCFA } from "@/lib/format";

type WaOrder = {
  id: string;
  number: number;
  code: string | null;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  pickupTime: string | null;
  subtotal: number;
  hasOnRequest: boolean;
  sentAt: string;
  items: Array<{ qty: number; code: string | null; name: string; variant: string | null; note: string | null }>;
};
type Data = { open: WaOrder[]; doneToday: number; cancelledToday: number };

/**
 * Dashboard: takeaway orders customers sent by WhatsApp, recorded on RestoCool. Every plan. The
 * business follows them here: « Confirmer », « Prête », « Remise au client » (fulfilled) or
 * « Annuler ». Live (order events) with a slow safety refresh.
 */
export function WhatsappOrders({ initial, perms }: { initial: Data; perms: { confirm: boolean; prepare: boolean; serve: boolean; cancel: boolean } }) {
  const t = useTranslations("whatsappOrders");
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const res = await fetch("/api/app/whatsapp-orders", { cache: "no-store" }).catch(() => null);
    if (res?.ok) setData((await res.json()) as Data);
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
    const id = setInterval(() => document.visibilityState === "visible" && void load(), 2 * 60_000);
    return () => {
      es?.close();
      clearInterval(id);
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  const move = async (o: WaOrder, to: "confirmed" | "ready" | "served" | "cancelled") => {
    if (to === "cancelled" && !window.confirm(t("cancelAsk", { n: o.number }))) return;
    setBusy(o.id);
    setError(null);
    const res = await fetch(`/api/app/whatsapp-orders/${o.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to }) }).catch(() => null);
    setBusy(null);
    if (!res?.ok) setError(t(res?.status === 403 ? "forbidden" : "error"));
    void load();
  };
  const time = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Ouagadougou" });

  return (
    <section className="rounded-2xl border-2 border-[#25D366]/60 bg-surface p-4" data-testid="whatsapp-orders" aria-labelledby="wa-orders-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="wa-orders-title" className="text-lg font-extrabold">
          💬 {t("title")} <span className="text-muted-foreground">({data.open.length})</span>
        </h2>
        <p className="text-sm text-muted-foreground">{t("today", { done: data.doneToday, cancelled: data.cancelledToday })}</p>
      </div>
      {error && (
        <p className="mb-2 text-sm font-semibold text-red-700" role="alert">
          {error}
        </p>
      )}
      {data.open.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.open.map((o) => (
            <li key={o.id} className="flex flex-col gap-2 rounded-xl border border-border p-3" data-testid="wa-order" data-status={o.status}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-extrabold">
                  {t("number", { n: o.number })} · {o.customerName ?? "—"}
                </p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${o.status === "ready" ? "bg-amber-100 text-amber-950" : o.status === "sent" ? "bg-red-100 text-red-900" : "bg-sky-100 text-sky-900"}`}>{t(`status.${o.status}`)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                🕘 {t("received", { time: time(o.sentAt) })}
                {o.pickupTime && <strong className="ml-2 text-foreground">🛍️ {t("pickup", { time: o.pickupTime })}</strong>}
                {o.code && <span className="ml-2 font-mono">{o.code}</span>}
              </p>
              <ul className="text-sm">
                {o.items.map((i, k) => (
                  <li key={k}>
                    {i.qty} × {i.code ? `${i.code}. ` : ""}
                    {i.name}
                    {i.variant && <span className="text-muted-foreground"> · {i.variant}</span>}
                    {i.note && <span className="italic"> — « {i.note} »</span>}
                  </li>
                ))}
              </ul>
              <p className="font-bold tabular-nums">
                {formatFCFA(o.subtotal) ?? "0 F"}
                {o.hasOnRequest ? ` + ${t("onRequest")}` : ""}
              </p>
              {o.customerPhone && (
                <a href={`tel:${o.customerPhone.replace(/\s/g, "")}`} className="text-sm font-semibold text-primary underline">
                  📞 {o.customerPhone}
                </a>
              )}
              <div className="flex flex-wrap gap-2">
                {o.status === "sent" && perms.confirm && (
                  <button type="button" disabled={busy === o.id} onClick={() => void move(o, "confirmed")} className="min-h-11 rounded-xl border border-border px-3 text-sm font-bold" data-testid="wa-confirm">
                    ✓ {t("confirm")}
                  </button>
                )}
                {o.status !== "ready" && perms.prepare && (
                  <button type="button" disabled={busy === o.id} onClick={() => void move(o, "ready")} className="min-h-11 rounded-xl border border-border px-3 text-sm font-bold" data-testid="wa-ready">
                    🔔 {t("ready")}
                  </button>
                )}
                {perms.serve && (
                  <button type="button" disabled={busy === o.id} onClick={() => void move(o, "served")} className="min-h-11 rounded-xl bg-primary px-3 text-sm font-extrabold text-primary-foreground" data-testid="wa-done">
                    🛍️ {t("done")}
                  </button>
                )}
                {perms.cancel && (
                  <button type="button" disabled={busy === o.id} onClick={() => void move(o, "cancelled")} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-red-700" data-testid="wa-cancel">
                    {t("cancel")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted-foreground">{t("hint")}</p>
    </section>
  );
}
