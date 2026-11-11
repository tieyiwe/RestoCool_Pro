"use client";

import { useCallback, useEffect, useState } from "react";
import { SeatMap } from "@/components/transport/seat-map";
import type { makeT } from "@/lib/public-menu/translate";
import { buildSeatMap } from "@/lib/transport/layout";

type T = ReturnType<typeof makeT>;
type BusSeat = { id: string; label: string; row: number; col: number; position: "window" | "aisle" | "middle" | null; occupied: boolean };
type Bus = {
  id: string;
  name: string;
  layout: { rows: number; left: number; right: number; doorRow: number | null; doorSide: "left" | "right"; back: number };
  trip: { route: string; departureAt: string } | null;
  seats: BusSeat[];
};

/**
 * The traveler picks their seat on the bus map (window / aisle at a glance). From the bus QR only
 * that bus is shown; otherwise the buses on a trip first. A seat already chosen on another phone
 * asks « C'est bien mon siège ? »: confirming is allowed (the hostess sees the double), no shared bill.
 */
export function BusPicker({
  slug,
  busToken,
  t,
  onChoose,
  onClose,
}: {
  slug: string;
  busToken: string | null;
  t: T;
  onChoose: (id: string, o?: { confirmJoin?: boolean }) => Promise<"ok" | "occupied" | "error">;
  onClose: () => void;
}) {
  const [buses, setBuses] = useState<Bus[] | null>(null);
  const [busId, setBusId] = useState<string | null>(null);
  const [taken, setTaken] = useState<BusSeat | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    fetch(`/api/public/r/${slug}/bus${busToken ? `?b=${encodeURIComponent(busToken)}` : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((b: { buses: Bus[] }) => {
        // Buses on a trip first.
        const list = [...b.buses].sort((x, y) => Number(Boolean(y.trip)) - Number(Boolean(x.trip)));
        setBuses(list);
        if (list.length === 1 || (list.filter((x) => x.trip).length === 1 && !busToken)) setBusId((list.find((x) => x.trip) ?? list[0])!.id);
      })
      .catch(() => setFailed(true));
  }, [slug, busToken]);
  useEffect(load, [load]);

  const bus = buses?.find((b) => b.id === busId) ?? null;

  async function pick(s: BusSeat, confirm = false) {
    setBusy(true);
    const res = await onChoose(s.id, confirm ? { confirmJoin: true } : undefined);
    setBusy(false);
    if (res === "occupied") setTaken(s);
    else if (res === "ok") onClose();
    else setFailed(true);
  }

  const map = bus ? buildSeatMap(bus.layout) : null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("busSeatTitle")}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-background p-4 sm:rounded-3xl"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        data-testid="bus-picker"
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-xl font-extrabold">{t("busSeatTitle")}</h2>
          <button type="button" onClick={onClose} aria-label={t("close")} className="h-11 w-11 rounded-full text-2xl hover:bg-muted">
            ×
          </button>
        </div>

        {taken ? (
          <div className="flex flex-col gap-3 text-center" role="alertdialog" aria-label={t("busTakenTitle", { label: taken.label })} data-testid="bus-taken-dialog">
            <p className="text-4xl" aria-hidden>
              💺
            </p>
            <p className="font-display text-lg font-extrabold">{t("busTakenTitle", { label: taken.label })}</p>
            <p className="text-muted-foreground">{t("busTakenText")}</p>
            <button type="button" disabled={busy} onClick={() => pick(taken, true)} className="min-h-12 rounded-xl font-bold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
              {t("busTakenYes")}
            </button>
            <button type="button" onClick={() => setTaken(null)} className="min-h-12 rounded-xl border border-border font-semibold">
              {t("busTakenNo")}
            </button>
          </div>
        ) : buses === null && !failed ? (
          <p className="py-8 text-center text-muted-foreground">{t("loadingSeats")}</p>
        ) : failed ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p>{t("seatsLoadError")}</p>
            <button type="button" onClick={load} className="min-h-11 rounded-xl border border-border px-4 font-semibold">
              {t("retry")}
            </button>
          </div>
        ) : !bus ? (
          <ul className="flex flex-col gap-2" data-testid="bus-list">
            {(buses ?? []).length === 0 && <li className="text-muted-foreground">{t("busNone")}</li>}
            {(buses ?? []).map((b) => (
              <li key={b.id}>
                <button type="button" onClick={() => setBusId(b.id)} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border-2 border-border px-4 text-left hover:border-[var(--accent)]">
                  <span className="font-bold">🚌 {b.name}</span>
                  <span className="text-sm text-muted-foreground">{b.trip ? b.trip.route : t("busNoTrip")}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-center text-sm">
              <b>🚌 {bus.name}</b>
              {bus.trip ? ` · ${bus.trip.route}` : ""}
            </p>
            {!bus.trip && (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" data-testid="bus-no-trip">
                {t("busNotStarted")}
              </p>
            )}
            <p className="text-center text-sm text-muted-foreground">{t("busSeatHint")}</p>
            {map && (
              <SeatMap
                seats={bus.seats.map((s) => ({ key: s.id, label: s.label, row: s.row, col: s.col, position: s.position, state: s.occupied ? "taken" : "free" }))}
                columns={map.columns}
                rows={map.rows}
                doorRow={bus.layout.doorRow}
                doorSide={bus.layout.doorSide}
                aisleCol={bus.layout.left}
                labels={{ front: t("busFront"), back: t("busBack"), door: t("busDoor"), window: t("busWindow"), aisle: t("busAisle") }}
                onPick={(s) => void pick(bus.seats.find((x) => x.id === s.key)!)}
                testId="traveler-bus-map"
              />
            )}
            <p className="text-center text-xs text-muted-foreground">{t("busLegend")}</p>
            {!busToken && (buses?.length ?? 0) > 1 && (
              <button type="button" onClick={() => setBusId(null)} className="min-h-11 text-sm font-semibold underline-offset-2 hover:underline">
                ← {t("busOther")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
