"use client";

import { useState } from "react";
import type { makeT } from "@/lib/public-menu/translate";
import { deviceId } from "./seating";

type T = ReturnType<typeof makeT>;
type Next = { kind: "redirect"; url: string } | { kind: "ussd"; code: string; instructions?: string } | { kind: "pending" } | { kind: "succeeded" } | null;

/**
 * « Payer maintenant » (online payment through the business's own Orange Money / Moov / aggregator
 * account). Only rendered when the business has connected a provider (`methods` not empty).
 */
export function PayNow({ slug, methods, orderId, t }: { slug: string; methods: string[]; orderId: string; t: T }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState(methods[0] ?? "");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ussd, setUssd] = useState<{ code: string; instructions?: string; intentId: string } | null>(null);
  if (methods.length === 0) return null;
  const mobile = method === "orange_money" || method === "moov_money";

  async function go() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/public/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, deviceId: deviceId(), method, orderId, phone: phone.trim() || undefined, requestId: `${orderId.slice(0, 8)}${Date.now().toString(36)}` }),
    }).catch(() => null);
    setBusy(false);
    if (!res) return setError("network");
    const body = (await res.json().catch(() => ({}))) as { intentId?: string; next?: Next; error?: string };
    if (!res.ok || !body.intentId) return setError(body.error ?? "error");
    const next = body.next;
    if (next?.kind === "redirect") window.location.href = next.url;
    else if (next?.kind === "ussd") setUssd({ code: next.code, instructions: next.instructions, intentId: body.intentId });
    else window.location.href = `/r/${slug}/paiement/${body.intentId}`;
  }

  if (ussd)
    return (
      <div className="mt-2 rounded-xl bg-muted p-3 text-sm" data-testid="pay-now-ussd">
        <p className="font-bold">{t("payUssd")}</p>
        <p className="my-2 text-center font-mono text-2xl font-extrabold">{ussd.code}</p>
        {ussd.instructions && <p>{ussd.instructions}</p>}
        <a href={`/r/${slug}/paiement/${ussd.intentId}`} className="mt-2 flex min-h-11 items-center justify-center rounded-xl border border-border font-bold">
          {t("payFollow")}
        </a>
      </div>
    );
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 min-h-11 w-full rounded-xl font-bold" style={{ background: "var(--accent)", color: "var(--on-accent)" }} data-testid="pay-now">
        💳 {t("payNow")}
      </button>
    );
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl border border-border p-3" data-testid="pay-now-form">
      <p className="text-sm font-semibold">{t("payChoose")}</p>
      <div className="flex flex-wrap gap-2">
        {methods.map((m) => (
          <button key={m} type="button" onClick={() => setMethod(m)} aria-pressed={method === m} className={`min-h-11 rounded-xl border-2 px-3 text-sm font-bold ${method === m ? "border-[var(--accent)]" : "border-border"}`}>
            {t(`payMethod_${m}`)}
          </button>
        ))}
      </div>
      {mobile && (
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t("payPhone")}
          <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+226 70 00 00 00" className="min-h-11 rounded-xl border border-border bg-surface px-3 text-base" />
        </label>
      )}
      {error && <p className="text-sm font-semibold text-red-700">{t(`payError_${["not_available", "not_yours", "nothing_to_pay", "network"].includes(error) ? error : "error"}`)}</p>}
      <button type="button" disabled={busy} onClick={() => void go()} className="min-h-12 rounded-xl font-extrabold disabled:opacity-60" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
        {busy ? t("sending") : t("payGo")}
      </button>
    </div>
  );
}
