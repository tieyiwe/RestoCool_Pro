import { cn } from "@/lib/utils";

export type MapSeat = { key: string; label: string; row: number; col: number; position: "window" | "aisle" | "middle" | null; state?: "free" | "taken" | "selected" | "flag" };

export type SeatMapLabels = { front: string; back: string; door: string; window: string; aisle: string };

/**
 * A bus seen from above, front at the top: seat numbers in their real place, the aisle in the
 * middle, the door row marked. Plain markup (no hooks): used by the bus editor preview, the
 * traveler's seat picker (`onPick`) and the hostess screens.
 */
export function SeatMap({
  seats,
  columns,
  rows,
  doorRow,
  doorSide = "right",
  aisleCol = null,
  labels,
  onPick,
  size = "md",
  testId = "seat-map",
}: {
  seats: MapSeat[];
  columns: number;
  rows: number;
  doorRow?: number | null;
  doorSide?: "left" | "right";
  /** The aisle column (= seats on the left of the aisle). */
  aisleCol?: number | null;
  labels: SeatMapLabels;
  onPick?: (s: MapSeat) => void;
  size?: "sm" | "md";
  testId?: string;
}) {
  const cell = size === "sm" ? "h-7 text-[11px]" : "h-12 text-sm";
  const byPos = new Map(seats.map((s) => [`${s.row}:${s.col}`, s]));
  return (
    <div className="mx-auto w-full max-w-sm rounded-[2rem] border-4 border-[#26130c]/20 bg-surface p-3" data-testid={testId}>
      <div className="mb-2 flex items-center justify-between text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
        <span>🧑‍✈️</span>
        <span>▲ {labels.front}</span>
        <span />
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: rows }, (_, i) => i + 1).flatMap((r) =>
          Array.from({ length: columns }, (_, c) => {
            const s = byPos.get(`${r}:${c}`);
            if (!s) {
              const doorHere = doorRow === r && ((doorSide === "right" && c === columns - 1) || (doorSide === "left" && c === 0));
              return (
                <span key={`${r}:${c}`} className={cn(cell, "flex items-center justify-center text-[10px] text-muted-foreground")} aria-hidden>
                  {doorHere ? `🚪 ${labels.door}` : c === aisleCol ? "·" : ""}
                </span>
              );
            }
            const state = s.state ?? "free";
            const inner = (
              <>
                <span className="font-extrabold tabular-nums">{s.label}</span>
                {size === "md" && s.position === "window" && <span className="sr-only">· {labels.window}</span>}
              </>
            );
            const cls = cn(
              cell,
              "flex items-center justify-center rounded-t-xl rounded-b-md border-2 transition-colors",
              state === "free" && "border-[#26130c]/30 bg-white text-[#26130c]",
              state === "taken" && "border-amber-400 bg-amber-100 text-amber-900",
              state === "selected" && "border-primary bg-primary text-primary-foreground",
              state === "flag" && "border-red-600 bg-red-100 text-red-900",
              s.position === "window" && "border-l-4",
            );
            return onPick ? (
              <button key={s.key} type="button" onClick={() => onPick(s)} className={cn(cls, "active:scale-95 motion-reduce:active:scale-100")} aria-pressed={state === "selected"} data-testid="map-seat" data-seat={s.label}>
                {inner}
              </button>
            ) : (
              <span key={s.key} className={cls} data-testid="map-seat" data-seat={s.label}>
                {inner}
              </span>
            );
          }),
        )}
      </div>
      <p className="mt-2 text-center text-[11px] font-bold tracking-wide text-muted-foreground uppercase">{labels.back}</p>
    </div>
  );
}
