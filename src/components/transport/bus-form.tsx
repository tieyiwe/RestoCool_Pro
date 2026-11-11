"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { buildSeatMap, DEFAULT_LAYOUT, type BusLayout } from "@/lib/transport/layout";
import { SeatMap } from "./seat-map";

const field = "min-h-11 w-full rounded-lg border border-border bg-surface px-3 text-base";

/**
 * Create a bus, or change its layout: a few numbers (rows, seats left and right of the aisle,
 * door row, back row) and the seat map draws itself, with the total to check against the bus.
 */
export function BusForm({
  action,
  initial,
  initialName = "",
  submitLabel,
  busId,
  backTo,
  testId = "bus-form",
}: {
  action: (fd: FormData) => void | Promise<void>;
  initial?: BusLayout;
  initialName?: string;
  submitLabel: string;
  busId?: string;
  /** Where to come back after saving (the setup wizard step). */
  backTo?: string;
  testId?: string;
}) {
  const t = useTranslations("transport.bus");
  const [l, setL] = useState<BusLayout>(initial ?? DEFAULT_LAYOUT);
  const [door, setDoor] = useState(Boolean(initial?.doorRow ?? false));
  const layout = { ...l, doorRow: door ? (l.doorRow ?? Math.ceil(l.rows / 2)) : null };
  const map = useMemo(() => {
    try {
      return buildSeatMap(layout);
    } catch {
      return null;
    }
  }, [layout.rows, layout.left, layout.right, layout.doorRow, layout.doorSide, layout.back]); // eslint-disable-line react-hooks/exhaustive-deps
  const num = (k: keyof BusLayout) => (e: React.ChangeEvent<HTMLInputElement>) => setL((v) => ({ ...v, [k]: Math.max(0, Number(e.target.value) || 0) }));

  return (
    <form action={action} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]" data-testid={testId}>
      <div className="flex flex-col gap-3">
        {busId && <input type="hidden" name="id" value={busId} />}
        {backTo && <input type="hidden" name="back_to" value={backTo} />}
        {!busId && (
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("name")}</span>
            <input name="name" required maxLength={40} defaultValue={initialName} placeholder={t("namePlaceholder")} className={field} />
          </label>
        )}
        <div className="grid grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("rows")}</span>
            <input name="rows" type="number" inputMode="numeric" min={1} max={30} value={l.rows} onChange={num("rows")} className={field} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("left")}</span>
            <input name="left" type="number" inputMode="numeric" min={0} max={3} value={l.left} onChange={num("left")} className={field} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-semibold">{t("right")}</span>
            <input name="right" type="number" inputMode="numeric" min={0} max={3} value={l.right} onChange={num("right")} className={field} />
          </label>
        </div>
        <label className="text-sm">
          <span className="mb-1 block font-semibold">{t("back")}</span>
          <input name="back" type="number" inputMode="numeric" min={0} max={7} value={l.back} onChange={num("back")} className={field} />
          <span className="mt-1 block text-xs text-muted-foreground">{t("backHint")}</span>
        </label>
        <fieldset className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={door} onChange={(e) => setDoor(e.target.checked)} className="size-5" />
            {t("door")}
          </label>
          {door && (
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="mb-1 block font-semibold">{t("doorRow")}</span>
                <input name="doorRow" type="number" inputMode="numeric" min={1} max={l.rows} value={layout.doorRow ?? ""} onChange={(e) => setL((v) => ({ ...v, doorRow: Math.max(1, Number(e.target.value) || 1) }))} className={field} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-semibold">{t("doorSide")}</span>
                <select name="doorSide" value={l.doorSide} onChange={(e) => setL((v) => ({ ...v, doorSide: e.target.value as "left" | "right" }))} className={field}>
                  <option value="right">{t("sideRight")}</option>
                  <option value="left">{t("sideLeft")}</option>
                </select>
              </label>
            </div>
          )}
        </fieldset>
        <p className={`rounded-xl p-3 text-center text-lg font-extrabold ${map ? "bg-primary/10" : "bg-red-50 text-red-900"}`} data-testid="bus-total">
          {map ? t("total", { n: map.seats.length }) : t("invalid")}
        </p>
        <button disabled={!map} className="min-h-12 rounded-xl bg-primary px-5 font-bold text-primary-foreground disabled:opacity-50" data-testid="bus-submit">
          {submitLabel}
        </button>
      </div>
      {map && (
        <SeatMap
          seats={map.seats.map((s) => ({ key: String(s.number), label: String(s.number), row: s.row, col: s.col, position: s.position }))}
          columns={map.columns}
          rows={map.rows}
          doorRow={layout.doorRow}
          doorSide={l.doorSide}
          aisleCol={l.left}
          size="sm"
          labels={{ front: t("front"), back: t("backLabel"), door: t("doorShort"), window: t("window"), aisle: t("aisle") }}
          testId="bus-preview"
        />
      )}
    </form>
  );
}
