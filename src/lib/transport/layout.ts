import { z } from "zod";

/**
 * A bus seat map from a few numbers (pure, shared by the server and the screens).
 *
 * Rows of seats on each side of the aisle (2 + 2 by default, any other count allowed), an
 * optional door row with no seats on the door side, and an optional back row across the bus.
 * Numbering (as on the Elitis pilot): row by row, left side from window to aisle, then right side
 * from window to aisle (seats read « 1 2 | 4 3 »); door row skips the door side; back row left to
 * right. Elitis: 12 rows, door at row 7, back row of 4 → 50 seats.
 */
export const BusLayout = z.object({
  rows: z.coerce.number().int().min(1).max(30),
  left: z.coerce.number().int().min(0).max(3),
  right: z.coerce.number().int().min(0).max(3),
  /** Row with no seats on the door side (middle door), or none. */
  doorRow: z.coerce.number().int().min(0).max(30).nullable().default(null),
  doorSide: z.enum(["left", "right"]).default("right"),
  /** Seats in the back row, across the bus (0 = none). */
  back: z.coerce.number().int().min(0).max(7).default(0),
});
export type BusLayout = z.infer<typeof BusLayout>;

export type BusSeat = {
  number: number;
  /** 1-based row; the back row is rows + 1. */
  row: number;
  /** Column on the map: 0 … left+right (the aisle is column `left`). */
  col: number;
  side: "left" | "right" | "back";
  position: "window" | "aisle" | "middle";
};

export const DEFAULT_LAYOUT: BusLayout = { rows: 12, left: 2, right: 2, doorRow: null, doorSide: "right", back: 4 };

function sidePosition(i: number, count: number): BusSeat["position"] {
  if (i === 0) return "window";
  if (i === count - 1) return "aisle";
  return "middle";
}

export function buildSeatMap(input: z.input<typeof BusLayout>): { seats: BusSeat[]; columns: number; rows: number } {
  const l = BusLayout.parse(input);
  if (l.left + l.right === 0) throw new Error("no seats per row");
  const seats: BusSeat[] = [];
  const columns = l.left + l.right + 1;
  let n = 0;
  for (let row = 1; row <= l.rows; row++) {
    const door = l.doorRow === row;
    if (!(door && l.doorSide === "left")) {
      for (let i = 0; i < l.left; i++) seats.push({ number: ++n, row, col: i, side: "left", position: sidePosition(i, l.left) });
    }
    if (!(door && l.doorSide === "right")) {
      // Right side: window first (rightmost column), then towards the aisle.
      for (let i = 0; i < l.right; i++) seats.push({ number: ++n, row, col: columns - 1 - i, side: "right", position: sidePosition(i, l.right) });
    }
  }
  if (l.back > 0) {
    const row = l.rows + 1;
    // Back row: across the whole width when it has a seat in the aisle, otherwise the seat columns.
    const cols =
      l.back >= columns
        ? Array.from({ length: columns }, (_, i) => i)
        : [...Array.from({ length: l.left }, (_, i) => i), ...Array.from({ length: l.right }, (_, i) => l.left + 1 + i)].slice(0, l.back);
    cols.slice(0, l.back).forEach((col, i, all) => seats.push({ number: ++n, row, col, side: "back", position: i === 0 || i === all.length - 1 ? "window" : "middle" }));
  }
  return { seats, columns, rows: l.rows + (l.back > 0 ? 1 : 0) };
}

export function seatCount(input: z.input<typeof BusLayout>): number {
  return buildSeatMap(input).seats.length;
}
