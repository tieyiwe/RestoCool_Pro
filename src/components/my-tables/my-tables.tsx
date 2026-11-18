"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { ReleaseTable } from "@/components/service/board";
import { formatFCFA } from "@/lib/format";
import { staffPost } from "@/lib/offline/staff-outbox";
import type { MyOrder, MyTables as Data } from "@/lib/service/my-tables";
import type { TableState } from "@/lib/seating/floor";

const STATES: TableState[] = ["ready", "waiting", "kitchen", "eating", "seated", "free"];
const TILE: Record<TableState, string> = {
  ready: "border-amber-500 bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100",
  waiting: "border-red-600 bg-red-50 text-red-950 dark:bg-red-900/40 dark:text-red-100",
  kitchen: "border-orange-500 bg-orange-50 text-orange-950 dark:bg-orange-900/30 dark:text-orange-100",
  eating: "border-sky-600 bg-sky-50 text-sky-950 dark:bg-sky-900/30 dark:text-sky-100",
  seated: "border-violet-500 bg-violet-50 text-violet-950 dark:bg-violet-900/30 dark:text-violet-100",
  free: "border-emerald-600 bg-emerald-50 text-emerald-950 dark:bg-emerald-900/30 dark:text-emerald-100",
};

/**
 * « Mes tables »: the server's phone. Bills asked for first, then dishes ready to serve, new orders
 * to confirm, and the server's tables (most urgent first) with « Prendre une commande »,
 * « Encaisser » and « Table libérée ». Live on every order/table event, 20 s poll as a fallback.
 */
export function MyTables({ initial, perms }: { initial: Data; perms: { take: boolean; confirm: boolean; serve: boolean; pay: boolean } }) {
  const t = useTranslations("myTables");
  const tf = useTranslations("floor");
  const [data, setData] = useState(initial);
  const [all, setAll] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    const res = await fetch(`/api/app/my-tables${all ? "?all=1" : ""}`, { cache: "no-store" }).catch(() => null);
    if (res?.ok) setData((await res.json()) as Data);
    setNow(Date.now());
  }, [all]);
  useEffect(() => {
    void load();
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
    es?.addEventListener("notice", soon);
    const id = setInterval(() => document.visibilityState === "visible" && void load(), 20_000);
    return () => {
      es?.close();
      clearInterval(id);
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  const mins = (iso: string | null) => (iso ? Math.max(0, Math.round((now - Date.parse(iso)) / 60_000)) : 0);
  const name = (x: { type: string; label: string }) => (x.type === "room" ? (/^(salon|room|vip|包间)/i.test(x.label) ? x.label : tf("room", { label: x.label })) : tf("table", { label: x.label }));
  const move = async (o: MyOrder, to: "confirmed" | "served") => {
    setBusy(o.id);
    await staffPost(`/api/app/orders/${o.id}/status`, { to });
    setBusy(null);
    void load();
  };
  const tables = [...data.tables].sort((a, b) => Number(Boolean(b.billRequestedAt)) - Number(Boolean(a.billRequestedAt)) || STATES.indexOf(a.state) - STATES.indexOf(b.state) || a.label.localeCompare(b.label, "fr", { numeric: true }));
  const bills = tables.filter((x) => x.billRequestedAt);

  const OrderRow = ({ o, action }: { o: MyOrder; action: "confirmed" | "served" }) => (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3" data-testid={action === "served" ? "my-to-serve" : "my-to-confirm"}>
      <Link href={`/app/orders/${o.id}`} className="min-w-0 flex-1">
        <span className="mr-2 rounded-lg bg-[#E9B530] px-2 py-0.5 font-extrabold text-black">{o.seatLabel ?? "—"}</span>
        <span className="font-bold">n° {o.number}</span>
        {o.customerName && <span className="ml-1 text-sm">· {o.customerName}</span>}
        <span className="ml-2 text-xs text-muted-foreground">
          {t("ago", { n: mins(action === "served" ? o.readyAt : o.sentAt) })} · {formatFCFA(o.subtotal)}
          {o.mine && ` · ${t("mine")}`}
        </span>
      </Link>
      {(action === "confirmed" ? perms.confirm : perms.serve) && (
        <button type="button" disabled={busy === o.id} onClick={() => void move(o, action)} className="min-h-11 rounded-xl bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50">
          {action === "confirmed" ? t("confirm") : t("served")}
        </button>
      )}
    </li>
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5" data-testid="my-tables">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">🍽️ {t("title")}</h1>
          <p className="text-sm text-muted-foreground">{data.assigned ? t("assignedHint") : t("noPlanHint")}</p>
        </div>
        <div className="flex gap-2">
          {data.assigned && (
            <button type="button" onClick={() => setAll((v) => !v)} aria-pressed={all} className="min-h-11 rounded-xl border border-border px-3 text-sm font-bold aria-pressed:bg-foreground aria-pressed:text-background" data-testid="my-all">
              {all ? t("onlyMine") : t("seeAll")}
            </button>
          )}
          {perms.take && (
            <Link href="/app/take" className="flex min-h-11 items-center rounded-xl bg-primary px-4 font-bold text-primary-foreground" data-testid="my-take">
              📝 {t("take")}
            </Link>
          )}
        </div>
      </div>

      {bills.length > 0 && (
        <section aria-labelledby="my-bills" className="rounded-2xl border-2 border-amber-500 bg-amber-50 p-3 text-amber-950 dark:bg-amber-900/30 dark:text-amber-100">
          <h2 id="my-bills" className="mb-2 font-extrabold">🧾 {t("bills", { n: bills.length })}</h2>
          <ul className="flex flex-wrap gap-2">
            {bills.map((b) => (
              <li key={b.seatId}>
                {perms.pay && b.sessionId ? (
                  <Link href={`/app/pay?session=${b.sessionId}`} className="flex min-h-11 items-center rounded-xl bg-amber-500 px-3 font-bold text-black" data-testid="my-bill">
                    💰 {name(b)} · {t("ago", { n: mins(b.billRequestedAt) })}
                  </Link>
                ) : (
                  <span className="flex min-h-11 items-center rounded-xl bg-amber-500 px-3 font-bold text-black" data-testid="my-bill">
                    {name(b)} · {t("ago", { n: mins(b.billRequestedAt) })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="my-serve">
        <h2 id="my-serve" className="mb-2 font-bold">
          🔔 {t("toServe")} <span className="text-muted-foreground">({data.toServe.length})</span>
        </h2>
        {data.toServe.length === 0 ? <p className="text-sm text-muted-foreground">{t("nothing")}</p> : <ul className="flex flex-col gap-2">{data.toServe.map((o) => <OrderRow key={o.id} o={o} action="served" />)}</ul>}
      </section>

      <section aria-labelledby="my-confirm">
        <h2 id="my-confirm" className="mb-2 font-bold">
          🆕 {t("toConfirm")} <span className="text-muted-foreground">({data.toConfirm.length})</span>
        </h2>
        {data.toConfirm.length === 0 ? <p className="text-sm text-muted-foreground">{t("nothing")}</p> : <ul className="flex flex-col gap-2">{data.toConfirm.map((o) => <OrderRow key={o.id} o={o} action="confirmed" />)}</ul>}
      </section>

      <section aria-labelledby="my-list">
        <h2 id="my-list" className="mb-2 font-bold">
          {t("tables")} <span className="text-muted-foreground">({tables.length})</span>
        </h2>
        {tables.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noTables")}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {tables.map((x) => (
              <li key={x.seatId} className={`flex flex-col gap-2 rounded-2xl border-2 p-3 ${TILE[x.state]}`} data-testid="my-table" data-state={x.state} data-label={x.label}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-lg font-extrabold">{name(x)}</p>
                  {x.billRequestedAt && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-extrabold text-black">🧾 {t("billAsked")}</span>}
                </div>
                <p className="text-sm font-semibold">
                  {tf(`state.${x.state}`)}
                  {x.sessionId && ` · ${t("ago", { n: mins(x.since) })}`}
                </p>
                {x.orders > 0 && (
                  <p className="text-sm">
                    {tf("orders", { n: x.orders })} · {formatFCFA(x.total)}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {perms.take && (
                    <Link href={`/app/take?seat=${x.seatId}`} className="flex min-h-10 items-center rounded-xl bg-white/80 px-3 text-sm font-bold text-black">
                      📝 {t("takeShort")}
                    </Link>
                  )}
                  {perms.pay && x.sessionId && x.orders > 0 && (
                    <Link href={`/app/pay?session=${x.sessionId}`} className="flex min-h-10 items-center rounded-xl bg-white/80 px-3 text-sm font-bold text-black">
                      💰 {t("collect")}
                    </Link>
                  )}
                  {perms.serve && x.sessionId && (x.state === "eating" || x.state === "seated") && <ReleaseTable sessionId={x.sessionId} seat={{ type: x.type, label: x.label }} onDone={() => void load()} compact />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
