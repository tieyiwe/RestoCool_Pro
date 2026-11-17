"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatFCFA } from "@/lib/format";
import { cn } from "@/lib/utils";

type Method = "cash" | "orange_money" | "moov_money" | "card" | "other";
const METHODS: Method[] = ["cash", "orange_money", "moov_money", "card", "other"];
const ICON: Record<Method, string> = { cash: "💵", orange_money: "🟠", moov_money: "🔵", card: "💳", other: "🧾" };

export type PayData = {
  billId: string;
  status: "open" | "paid" | "void";
  seatLabel: string | null;
  seatType: string | null;
  subtotal: number;
  adjustment: number;
  discount: number;
  discountReason: string | null;
  total: number;
  paid: number;
  due: number;
  hasOnRequest: boolean;
  customerPhone: string | null;
  customerName: string | null;
  orders: Array<{ id: string; code: string | null; number: number; status: string; lines: Array<{ id: string; name: string; qty: number; unitPrice: number | null; note: string | null; paid: boolean }> }>;
  payments: Array<{ id: string; method: Method; amount: number; reference: string | null; splitLabel: string | null; at: string }>;
  canDiscount: boolean;
  numbers: { orange: string | null; moov: string | null };
  business: string;
};

const F = (n: number) => formatFCFA(n) ?? "0 F";
const KNOWN_ERRORS = ["nothing_to_pay", "already_paid", "locked", "too_much", "reference_required", "received_too_low", "discount_reason", "discount_approval", "discount_too_big", "invalid", "network", "forbidden"];
const newKey = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
/** Quick cash amounts: exact, then the next round notes. */
function quickCash(due: number) {
  const out = new Set<number>([due]);
  for (const step of [500, 1000, 2000, 5000, 10000]) out.add(Math.ceil(due / step) * step);
  return [...out].filter((v) => v >= due).sort((a, b) => a - b).slice(0, 5);
}

/**
 * The cash register for one bill: lines, « sur demande » price and discount (before any payment),
 * whole / equal parts / by dish, the method, cash received with the change, the mobile money
 * reference. Every payment goes to the server, which computes and checks the amounts.
 */
export function PayScreen({ data }: { data: PayData }) {
  const t = useTranslations("cashier");
  const router = useRouter();
  const [mode, setMode] = useState<"all" | "parts" | "items">("all");
  const [parts, setParts] = useState(2);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<Method>("cash");
  const [received, setReceived] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastChange, setLastChange] = useState<number | null>(null);
  const [requestId, setRequestId] = useState(newKey);
  // « Sur demande » and discount (only before the first payment).
  const [adjustment, setAdjustment] = useState(String(data.adjustment || ""));
  const [discount, setDiscount] = useState(String(data.discount || ""));
  const [reason, setReason] = useState(data.discountReason ?? "");
  const [showDiscount, setShowDiscount] = useState(data.discount > 0);
  const locked = data.paid > 0 || data.status !== "open";
  const paidParts = data.payments.filter((p) => p.splitLabel && /^\d+\/\d+$/.test(p.splitLabel)).length;

  const amount = useMemo(() => {
    if (mode === "items") {
      let s = 0;
      for (const o of data.orders) for (const l of o.lines) if (picked.has(l.id)) s += (l.unitPrice ?? 0) * l.qty;
      return Math.min(s, data.due);
    }
    if (mode === "parts") {
      const left = Math.max(1, parts - paidParts);
      return left === 1 ? data.due : Math.ceil(data.due / left);
    }
    return data.due;
  }, [mode, picked, parts, paidParts, data.due, data.orders]);
  const recv = Number(received.replace(/\D/g, "")) || 0;
  const change = method === "cash" && recv >= amount ? recv - amount : null;
  const needRef = method === "orange_money" || method === "moov_money";
  const ready = data.due === 0 || (amount > 0 && (!needRef || reference.trim().length >= 3) && (method !== "cash" || !received || recv >= amount));

  async function post(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(false);
    if (!res) {
      setError("network");
      return null;
    }
    const json = (await res.json().catch(() => ({}))) as { error?: string; settled?: boolean; change?: number };
    if (!res.ok) {
      setError(json.error ?? "error");
      return null;
    }
    return json;
  }

  async function saveAmounts() {
    const ok = await post(`/api/app/bills/${data.billId}/amounts`, {
      adjustment: Number(adjustment.replace(/\D/g, "")) || 0,
      discount: showDiscount ? Number(discount.replace(/\D/g, "")) || 0 : 0,
      discountReason: showDiscount && reason.trim() ? reason.trim() : undefined,
    });
    if (ok) router.refresh();
  }

  async function pay() {
    const res = await post(`/api/app/bills/${data.billId}/pay`, {
      method,
      amount: mode === "items" ? undefined : amount,
      items: mode === "items" ? [...picked] : undefined,
      received: method === "cash" && recv ? recv : undefined,
      reference: reference.trim() || undefined,
      splitLabel: mode === "parts" ? `${paidParts + 1}/${parts}` : undefined,
      requestId,
    });
    if (!res) return;
    setLastChange(typeof res.change === "number" ? res.change : null);
    setReceived("");
    setReference("");
    setPicked(new Set());
    setRequestId(newKey());
    router.refresh();
  }

  const seat = data.seatType === "table" ? t("table", { label: data.seatLabel ?? "" }) : data.seatType === "room" ? t("room", { label: data.seatLabel ?? "" }) : (data.seatLabel ?? t("order"));
  const waText = encodeURIComponent(
    [t("waReceiptTitle", { business: data.business }), ...data.orders.flatMap((o) => o.lines.map((l) => `${l.qty} × ${l.name}${l.unitPrice !== null ? ` · ${F(l.unitPrice * l.qty)}` : ""}`)), `${t("total")} : ${F(data.total)}`, t("waThanks")].join("\n"),
  );
  const waTo = data.customerPhone ? data.customerPhone.replace(/\D/g, "") : "";

  if (data.status === "paid")
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 py-4 text-center" data-testid="pay-done">
        <p className="text-6xl" aria-hidden>
          ✅
        </p>
        <h1 className="text-2xl font-extrabold">{t("paidTitle", { amount: F(data.total) })}</h1>
        <p className="text-muted-foreground">{seat}</p>
        {lastChange !== null && lastChange > 0 && (
          <p className="rounded-2xl bg-amber-100 p-4 text-xl font-extrabold text-amber-950" data-testid="pay-change">
            {t("changeToGive", { amount: F(lastChange) })}
          </p>
        )}
        <div className="grid gap-2">
          <Link href={`/app/receipts/${data.billId}`} className="flex min-h-12 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground" data-testid="pay-receipt">
            🧾 {t("receipt")}
          </Link>
          <a href={`https://wa.me/${waTo}?text=${waText}`} target="_blank" rel="noopener" className="flex min-h-12 items-center justify-center rounded-xl bg-[#25D366] font-bold text-black" data-testid="pay-whatsapp">
            💬 {t("sendWhatsapp")}
          </a>
          <Link href="/app/cashier" className="flex min-h-12 items-center justify-center rounded-xl border border-border font-bold">
            {t("backToCashier")}
          </Link>
        </div>
      </div>
    );

  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[1fr_minmax(0,26rem)]" data-testid="pay-screen">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-extrabold">
            💰 {seat}
            {data.customerName && <span className="ml-2 text-base font-semibold text-muted-foreground">{data.customerName}</span>}
          </h1>
          <Link href="/app/cashier" className="text-sm font-semibold underline">
            {t("backToCashier")}
          </Link>
        </div>
        {data.orders.map((o) => (
          <div key={o.id} className="rounded-2xl border border-border bg-surface p-3">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">
              {t("orderNo", { n: o.number })} {o.code && <span className="font-mono">{o.code}</span>}
            </p>
            <ul className="divide-y divide-border">
              {o.lines.map((l) => (
                <li key={l.id} className={cn("flex items-center gap-3 py-2", l.paid && "opacity-50")}>
                  {mode === "items" && (
                    <input
                      type="checkbox"
                      className="h-6 w-6"
                      disabled={l.paid || l.unitPrice === null}
                      checked={picked.has(l.id)}
                      onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(l.id); else n.delete(l.id); return n; })}
                      aria-label={l.name}
                      data-testid="pay-line-check"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">
                      {l.qty} × {l.name}
                    </span>
                    {l.note && <span className="block text-xs text-muted-foreground">« {l.note} »</span>}
                    {l.paid && <span className="text-xs font-bold text-emerald-700"> · {t("linePaid")}</span>}
                  </span>
                  <span className="tabular-nums">{l.unitPrice === null ? t("onRequest") : F(l.unitPrice * l.qty)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {data.payments.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface p-3" data-testid="pay-history">
            <p className="mb-1 font-bold">{t("alreadyPaid")}</p>
            <ul className="text-sm">
              {data.payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-2 py-0.5">
                  <span>
                    {ICON[p.method]} {t(`methods.${p.method}`)} {p.splitLabel && <span className="text-muted-foreground">({p.splitLabel})</span>} {p.reference && <span className="font-mono text-xs text-muted-foreground">{p.reference}</span>}
                  </span>
                  <span className="tabular-nums">{F(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border-2 border-primary/40 bg-surface p-4 lg:sticky lg:top-20 lg:self-start">
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
          <dt>{t("subtotal")}</dt>
          <dd className="text-right tabular-nums">{F(data.subtotal)}</dd>
          {data.adjustment > 0 && (
            <>
              <dt>{t("onRequestAmount")}</dt>
              <dd className="text-right tabular-nums">+ {F(data.adjustment)}</dd>
            </>
          )}
          {data.discount > 0 && (
            <>
              <dt>
                {t("discount")} <span className="text-xs text-muted-foreground">({data.discountReason})</span>
              </dt>
              <dd className="text-right tabular-nums text-red-700">− {F(data.discount)}</dd>
            </>
          )}
          <dt className="text-base font-extrabold">{t("total")}</dt>
          <dd className="text-right text-base font-extrabold tabular-nums" data-testid="pay-total">
            {F(data.total)}
          </dd>
          {data.paid > 0 && (
            <>
              <dt>{t("alreadyPaid")}</dt>
              <dd className="text-right tabular-nums">{F(data.paid)}</dd>
            </>
          )}
          <dt className="text-lg font-extrabold">{t("due")}</dt>
          <dd className="text-right text-lg font-extrabold tabular-nums" data-testid="pay-due">
            {F(data.due)}
          </dd>
        </dl>

        {!locked && (data.hasOnRequest || data.canDiscount) && (
          <details className="rounded-xl bg-muted p-3" open={data.hasOnRequest && !data.adjustment}>
            <summary className="min-h-11 cursor-pointer py-2 font-semibold">{t("adjustTitle")}</summary>
            <div className="mt-2 flex flex-col gap-2">
              {data.hasOnRequest && (
                <label className="flex flex-col gap-1 text-sm font-semibold">
                  {t("onRequestAmount")}
                  <input inputMode="numeric" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} className="min-h-11 rounded-lg border border-border bg-background px-3 text-base" data-testid="pay-adjustment" />
                </label>
              )}
              {data.canDiscount &&
                (showDiscount ? (
                  <>
                    <label className="flex flex-col gap-1 text-sm font-semibold">
                      {t("discount")}
                      <input inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value)} className="min-h-11 rounded-lg border border-border bg-background px-3 text-base" data-testid="pay-discount" />
                    </label>
                    <label className="flex flex-col gap-1 text-sm font-semibold">
                      {t("discountReason")}
                      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder={t("discountReasonPlaceholder")} className="min-h-11 rounded-lg border border-border bg-background px-3 text-base" data-testid="pay-discount-reason" />
                    </label>
                  </>
                ) : (
                  <button type="button" onClick={() => setShowDiscount(true)} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold" data-testid="pay-add-discount">
                    + {t("addDiscount")}
                  </button>
                ))}
              <button type="button" onClick={() => void saveAmounts()} disabled={busy} className="min-h-11 rounded-lg bg-foreground px-3 text-sm font-bold text-background" data-testid="pay-apply">
                {t("apply")}
              </button>
            </div>
          </details>
        )}

        <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label={t("splitLabel")}>
          {(["all", "parts", "items"] as const).map((m) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cn("min-h-11 rounded-lg text-sm font-semibold", mode === m && "bg-surface shadow-sm")} data-testid={`pay-mode-${m}`}>
              {t(`mode.${m}`)}
            </button>
          ))}
        </div>
        {mode === "parts" && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">{t("partsCount")}</span>
            <span className="flex items-center gap-2">
              <button type="button" onClick={() => setParts((p) => Math.max(Math.max(2, paidParts + 1), p - 1))} className="h-11 w-11 rounded-full border border-border text-xl" aria-label="−">
                −
              </button>
              <span className="w-8 text-center text-lg font-extrabold tabular-nums" data-testid="pay-parts">
                {parts}
              </span>
              <button type="button" onClick={() => setParts((p) => Math.min(20, p + 1))} className="h-11 w-11 rounded-full border border-border text-xl" aria-label="+" data-testid="pay-parts-plus">
                +
              </button>
            </span>
          </div>
        )}
        {mode === "parts" && <p className="text-sm text-muted-foreground">{t("partOf", { n: Math.min(paidParts + 1, parts), of: parts, amount: F(amount) })}</p>}
        {mode === "items" && <p className="text-sm text-muted-foreground">{t("pickItems")}</p>}

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-3" role="radiogroup" aria-label={t("method")}>
          {METHODS.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)} className={cn("flex min-h-14 flex-col items-center justify-center rounded-xl border-2 text-xs font-bold", method === m ? "border-primary bg-primary/10" : "border-border")} data-testid={`pay-method-${m}`}>
              <span className="text-lg" aria-hidden>
                {ICON[m]}
              </span>
              {t(`methods.${m}`)}
            </button>
          ))}
        </div>

        {method === "cash" && (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              {t("received")}
              <input inputMode="numeric" value={received} onChange={(e) => setReceived(e.target.value)} placeholder={F(amount)} className="min-h-12 rounded-lg border border-border bg-background px-3 text-lg tabular-nums" data-testid="pay-received" />
            </label>
            <div className="flex flex-wrap gap-2">
              {quickCash(amount).map((v) => (
                <button key={v} type="button" onClick={() => setReceived(String(v))} className="min-h-11 rounded-lg border border-border px-3 text-sm font-semibold tabular-nums">
                  {F(v)}
                </button>
              ))}
            </div>
            {change !== null && recv > 0 && (
              <p className="rounded-xl bg-amber-100 p-3 text-lg font-extrabold text-amber-950" data-testid="pay-change-preview">
                {t("changeToGive", { amount: F(change) })}
              </p>
            )}
          </div>
        )}
        {needRef && (
          <div className="flex flex-col gap-2">
            {(method === "orange_money" ? data.numbers.orange : data.numbers.moov) && (
              <p className="flex items-center justify-between gap-2 rounded-xl bg-muted p-3 text-sm">
                <span>
                  {t("ourNumber")} <b className="tabular-nums">{method === "orange_money" ? data.numbers.orange : data.numbers.moov}</b>
                </span>
                <button type="button" onClick={() => void navigator.clipboard?.writeText((method === "orange_money" ? data.numbers.orange : data.numbers.moov) ?? "")} className="min-h-11 rounded-lg border border-border px-3 font-semibold">
                  {t("copy")}
                </button>
              </p>
            )}
            <label className="flex flex-col gap-1 text-sm font-semibold">
              {t("reference")}
              <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} placeholder={t("referencePlaceholder")} className="min-h-12 rounded-lg border border-border bg-background px-3 text-base" data-testid="pay-reference" />
            </label>
          </div>
        )}
        {(method === "card" || method === "other") && (
          <label className="flex flex-col gap-1 text-sm font-semibold">
            {t("referenceOptional")}
            <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} className="min-h-12 rounded-lg border border-border bg-background px-3 text-base" />
          </label>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800" data-testid="pay-error">
            {t(`errors.${KNOWN_ERRORS.includes(error) ? error : "error"}`)}
          </p>
        )}
        <button type="button" onClick={() => void pay()} disabled={!ready || busy} className="min-h-14 rounded-xl bg-emerald-600 text-lg font-extrabold text-white disabled:opacity-50" data-testid="pay-submit">
          {busy ? t("saving") : data.due === 0 ? t("closeFree") : t("collect", { amount: F(amount) })}
        </button>
        <p className="text-center text-xs text-muted-foreground">{t("networkNeeded")}</p>
      </section>
    </div>
  );
}
