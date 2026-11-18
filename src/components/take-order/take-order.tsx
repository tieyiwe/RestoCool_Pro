"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { formatFCFA } from "@/lib/format";
import type { PublicCategory, PublicItem } from "@/lib/public-menu/types";

type Seat = { id: string; type: string; label: string };
type Line = { key: string; item: PublicItem; variantId: string | null; optionIds: string[]; qty: number; note: string };
const GROUP_ORDER = ["table", "room", "area", "counter", "takeaway", "delivery"];
const rid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`.padEnd(16, "0");

/**
 * The server's own order pad: choose the place, add dishes (variants, options, a note per
 * dish), then « Envoyer en cuisine ». Prices are shown as a guide; the server computes the real ones.
 */
export function TakeOrder({ categories, seats, initialSeat }: { categories: PublicCategory[]; seats: Seat[]; initialSeat: string | null }) {
  const t = useTranslations("takeOrder");
  const locale = useLocale() as "fr" | "en" | "zh";
  const name = (x: { fr: string; en?: string; zh?: string } | null | undefined) => (x ? (x[locale] ?? x.fr) : "");
  const [seatId, setSeatId] = useState<string | null>(initialSeat);
  const [lines, setLines] = useState<Line[]>([]);
  const [q, setQ] = useState("");
  const [picking, setPicking] = useState<PublicItem | null>(null);
  const [customer, setCustomer] = useState({ name: "", phone: "", address: "", pickup: "" });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; code: string | null; number: number } | null>(null);
  const [requestId, setRequestId] = useState(rid);

  const seat = seats.find((s) => s.id === seatId) ?? null;
  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return categories;
    return categories
      .map((c) => ({ ...c, items: c.items.filter((i) => [i.code ?? "", i.name.fr, i.name.en ?? "", i.name.zh ?? ""].some((s) => s.toLowerCase().includes(k))) }))
      .filter((c) => c.items.length);
  }, [categories, q]);

  const unit = (l: Pick<Line, "item" | "variantId" | "optionIds">) => {
    const base = l.variantId ? (l.item.variants.find((v) => v.id === l.variantId)?.price ?? null) : l.item.price;
    if (base == null) return null;
    return base + l.item.options.filter((o) => l.optionIds.includes(o.id)).reduce((a, o) => a + o.priceDelta, 0);
  };
  const total = lines.reduce((a, l) => a + (unit(l) ?? 0) * l.qty, 0);
  const onRequest = lines.some((l) => unit(l) == null);

  function add(item: PublicItem, variantId: string | null = null, optionIds: string[] = []) {
    const key = `${item.id}:${variantId ?? ""}:${[...optionIds].sort().join(",")}`;
    setLines((ls) => (ls.some((l) => l.key === key) ? ls.map((l) => (l.key === key ? { ...l, qty: Math.min(50, l.qty + 1) } : l)) : [...ls, { key, item, variantId, optionIds, qty: 1, note: "" }]));
  }
  const tap = (item: PublicItem) => (item.variants.length || item.options.length ? setPicking(item) : add(item));
  const setQty = (key: string, qty: number) => setLines((ls) => (qty <= 0 ? ls.filter((l) => l.key !== key) : ls.map((l) => (l.key === key ? { ...l, qty: Math.min(50, qty) } : l))));

  async function send() {
    if (!seat || !lines.length) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/app/orders/take", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seatId: seat.id,
        requestId,
        lines: lines.map((l) => ({ itemId: l.item.id, variantId: l.variantId, optionIds: l.optionIds, qty: l.qty, note: l.note.trim() || undefined })),
        customerName: customer.name.trim() || undefined,
        customerPhone: customer.phone.trim() || undefined,
        deliveryAddress: customer.address.trim() || undefined,
        pickupTime: customer.pickup || undefined,
        note: note.trim() || undefined,
      }),
    }).catch(() => null);
    setBusy(false);
    if (!res) return setError("network");
    const body = (await res.json().catch(() => ({}))) as { id?: string; code?: string | null; number?: number; error?: string };
    if (!res.ok || !body.id) return setError(body.error ?? "error");
    setDone({ id: body.id, code: body.code ?? null, number: body.number ?? 0 });
  }

  function again() {
    setLines([]);
    setNote("");
    setCustomer({ name: "", phone: "", address: "", pickup: "" });
    setDone(null);
    setRequestId(rid());
  }

  if (done)
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-10 text-center" data-testid="take-done">
        <p className="text-5xl">✅</p>
        <h1 className="text-2xl font-extrabold">{t("sent", { n: done.number })}</h1>
        {done.code && <p className="font-mono text-sm text-muted-foreground">{done.code}</p>}
        <p>{t("sentHint", { seat: seat?.label ?? "" })}</p>
        <div className="flex w-full flex-col gap-2">
          <button type="button" onClick={again} className="min-h-12 rounded-xl bg-primary font-bold text-primary-foreground" data-testid="take-again">
            ➕ {t("again")}
          </button>
          <Link href={`/app/orders/${done.id}`} className="flex min-h-12 items-center justify-center rounded-xl border border-border font-bold">
            {t("open")}
          </Link>
          <Link href="/app/tables" className="flex min-h-12 items-center justify-center rounded-xl border border-border font-bold">
            {t("myTables")}
          </Link>
        </div>
      </div>
    );

  const needsName = seat && ["takeaway", "delivery", "counter"].includes(seat.type);
  const groups = GROUP_ORDER.map((g) => [g, seats.filter((s) => s.type === g)] as const).filter(([, l]) => l.length);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 pb-48" data-testid="take-order">
      <div>
        <h1 className="text-2xl font-extrabold">📝 {t("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-3" aria-labelledby="take-seat">
        <h2 id="take-seat" className="mb-2 font-bold">
          1. {t("where")} {seat && <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-sm text-primary-foreground">{seat.label}</span>}
        </h2>
        {seats.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noSeats")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {groups.map(([g, list]) => (
              <div key={g}>
                <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase">{t(`group.${g}`)}</p>
                <div className="flex flex-wrap gap-2">
                  {list.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSeatId(s.id)}
                      aria-pressed={seatId === s.id}
                      className="min-h-11 min-w-11 rounded-xl border-2 border-border px-3 font-bold aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                      data-testid="take-seat"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {needsName && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder={t("customerName")} aria-label={t("customerName")} className="min-h-11 rounded-xl border border-border bg-background px-3 text-base" data-testid="take-name" />
            <input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} placeholder={t("customerPhone")} aria-label={t("customerPhone")} inputMode="tel" className="min-h-11 rounded-xl border border-border bg-background px-3 text-base" />
            {seat?.type === "delivery" && (
              <input value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} placeholder={t("address")} aria-label={t("address")} className="min-h-11 rounded-xl border border-border bg-background px-3 text-base sm:col-span-2" />
            )}
            {seat?.type === "takeaway" && (
              <label className="flex items-center gap-2 text-sm font-semibold">
                {t("pickup")}
                <input type="time" value={customer.pickup} onChange={(e) => setCustomer({ ...customer, pickup: e.target.value })} className="min-h-11 rounded-xl border border-border bg-background px-3 text-base" />
              </label>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="take-dishes">
        <h2 id="take-dishes" className="font-bold">
          2. {t("dishes")}
        </h2>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`🔎 ${t("search")}`} aria-label={t("search")} className="min-h-11 rounded-xl border border-border bg-surface px-3 text-base" data-testid="take-search" />
        {filtered.map((c, idx) => (
          <details key={c.id} open={Boolean(q) || filtered.length <= 3 || idx === 0} className="rounded-2xl border border-border bg-surface">
            <summary className="flex min-h-11 cursor-pointer items-center px-3 font-bold">
              {name(c.name)} <span className="ml-2 text-xs text-muted-foreground">({c.items.length})</span>
            </summary>
            <ul className="divide-y divide-border">
              {c.items.map((i) => {
                const inCart = lines.filter((l) => l.item.id === i.id).reduce((a, l) => a + l.qty, 0);
                return (
                  <li key={i.id}>
                    <button
                      type="button"
                      disabled={i.soldOut}
                      onClick={() => tap(i)}
                      className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted disabled:opacity-50"
                      data-testid="take-item"
                      data-name={i.name.fr}
                    >
                      <span>
                        {i.code && <span className="mr-1 text-xs text-muted-foreground">{i.code}</span>}
                        <span className="font-semibold">{name(i.name)}</span>
                        {i.soldOut && <span className="ml-2 rounded-full bg-red-100 px-2 text-xs font-bold text-red-900">{t("soldOut")}</span>}
                        {(i.variants.length > 0 || i.options.length > 0) && <span className="ml-2 text-xs text-muted-foreground">{t("choices")}</span>}
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-sm">
                        {inCart > 0 && <span className="rounded-full bg-primary px-2 font-bold text-primary-foreground">×{inCart}</span>}
                        <span className="tabular-nums">{i.price != null ? formatFCFA(i.price) : i.variants.length ? "…" : t("onRequest")}</span>
                        <span aria-hidden className="text-xl font-bold">＋</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        ))}
      </section>

      {picking && <Chooser item={picking} name={name} t={t} onClose={() => setPicking(null)} onAdd={(v, o) => (add(picking, v, o), setPicking(null))} />}

      {/* The order being written, always visible at the bottom. */}
      <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-30 border-t border-border bg-surface/95 p-3 shadow-2xl backdrop-blur md:bottom-0 md:left-64 md:pb-[max(0.75rem,env(safe-area-inset-bottom))]" data-testid="take-pad">
        <div className="mx-auto flex max-w-5xl flex-col gap-2">
          {lines.length > 0 && (
            <details open={lines.length <= 4}>
              <summary className="cursor-pointer text-sm font-bold">{t("lines", { n: lines.reduce((a, l) => a + l.qty, 0) })}</summary>
              <ul className="mt-1 flex max-h-56 flex-col gap-1 overflow-y-auto">
                {lines.map((l) => (
                  <li key={l.key} className="flex flex-wrap items-center gap-2 text-sm" data-testid="take-line">
                    <span className="flex items-center rounded-xl border border-border">
                      <button type="button" onClick={() => setQty(l.key, l.qty - 1)} className="min-h-10 min-w-10 font-bold" aria-label={t("less")}>
                        −
                      </button>
                      <span className="min-w-6 text-center font-bold tabular-nums">{l.qty}</span>
                      <button type="button" onClick={() => setQty(l.key, l.qty + 1)} className="min-h-10 min-w-10 font-bold" aria-label={t("more")}>
                        +
                      </button>
                    </span>
                    <span className="min-w-0 flex-1 font-semibold">
                      {name(l.item.name)}
                      {l.variantId && <span className="text-muted-foreground"> · {name(l.item.variants.find((v) => v.id === l.variantId)?.name)}</span>}
                      {l.optionIds.length > 0 && <span className="text-muted-foreground"> · {l.item.options.filter((o) => l.optionIds.includes(o.id)).map((o) => name(o.name)).join(", ")}</span>}
                    </span>
                    <input
                      value={l.note}
                      onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, note: e.target.value.slice(0, 140) } : x)))}
                      placeholder={t("lineNote")}
                      aria-label={t("lineNote")}
                      className="min-h-10 w-full rounded-lg border border-border bg-background px-2 text-base sm:w-40"
                    />
                  </li>
                ))}
              </ul>
              <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder={t("orderNote")} aria-label={t("orderNote")} className="mt-1 min-h-10 w-full rounded-lg border border-border bg-background px-2 text-base" />
            </details>
          )}
          {error && (
            <p className="text-sm font-semibold text-red-700" role="alert">
              {t(`errors.${["no_seat", "unavailable", "takeaway_required", "delivery_required", "no_trip", "network"].includes(error) ? error : "error"}`)}
            </p>
          )}
          <button
            type="button"
            disabled={!seat || !lines.length || busy || Boolean(needsName && seat?.type !== "counter" && !customer.name.trim())}
            onClick={() => void send()}
            className="min-h-12 rounded-xl bg-primary px-4 font-extrabold text-primary-foreground disabled:opacity-50"
            data-testid="take-send"
          >
            {busy ? t("sending") : !seat ? t("pickSeat") : !lines.length ? t("addDishes") : `${t("send", { seat: seat.label })} · ${formatFCFA(total) ?? "0 F"}${onRequest ? " +" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Chooser({
  item,
  name,
  t,
  onClose,
  onAdd,
}: {
  item: PublicItem;
  name: (x: { fr: string; en?: string; zh?: string } | null | undefined) => string;
  t: ReturnType<typeof useTranslations>;
  onClose: () => void;
  onAdd: (variantId: string | null, optionIds: string[]) => void;
}) {
  const [variant, setVariant] = useState<string | null>(item.variants[0]?.id ?? null);
  const [opts, setOpts] = useState<string[]>([]);
  const groups = [...new Set(item.options.map((o) => o.group.fr))];
  return (
    <div role="dialog" aria-modal="true" aria-label={name(item.name)} className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-surface p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()} data-testid="take-chooser">
        <h3 className="mb-3 text-lg font-extrabold">{name(item.name)}</h3>
        {item.variants.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {item.variants.map((v) => (
              <button key={v.id} type="button" onClick={() => setVariant(v.id)} aria-pressed={variant === v.id} className="min-h-11 rounded-xl border-2 border-border px-3 font-semibold aria-pressed:border-primary">
                {name(v.name)} · {formatFCFA(v.price)}
              </button>
            ))}
          </div>
        )}
        {groups.map((g) => (
          <fieldset key={g} className="mb-3">
            <legend className="text-sm font-bold">{g}</legend>
            {item.options
              .filter((o) => o.group.fr === g)
              .map((o) => (
                <label key={o.id} className="flex min-h-11 items-center gap-2">
                  <input type="checkbox" checked={opts.includes(o.id)} onChange={(e) => setOpts((s) => (e.target.checked ? [...s, o.id] : s.filter((x) => x !== o.id)))} className="h-5 w-5" />
                  {name(o.name)} {o.priceDelta ? `(+${formatFCFA(o.priceDelta)})` : ""}
                </label>
              ))}
          </fieldset>
        ))}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="min-h-12 flex-1 rounded-xl border border-border font-bold">
            {t("cancel")}
          </button>
          <button type="button" onClick={() => onAdd(variant, opts)} className="min-h-12 flex-1 rounded-xl bg-primary font-bold text-primary-foreground" data-testid="take-chooser-add">
            {t("add")}
          </button>
        </div>
      </div>
    </div>
  );
}
