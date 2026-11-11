import { describe, expect, it } from "vitest";
import { buildSeatMap, seatCount } from "@/lib/transport/layout";

describe("bus seat map", () => {
  it("matches the Elitis pilot: 12 rows, door at row 7, back row of 4 → 50 seats", () => {
    const { seats, columns } = buildSeatMap({ rows: 12, left: 2, right: 2, doorRow: 7, back: 4 });
    expect(seats).toHaveLength(50);
    expect(columns).toBe(5);
    const at = (n: number) => seats.find((s) => s.number === n)!;
    // Row 1 reads « 1 2 | 4 3 »: left window, left aisle, right window, right aisle.
    expect([at(1), at(2), at(3), at(4)].map((s) => [s.col, s.position])).toEqual([
      [0, "window"],
      [1, "aisle"],
      [4, "window"],
      [3, "aisle"],
    ]);
    // Door row 7: seats 25 and 26 on the left only; row 8 starts at 27.
    expect(seats.filter((s) => s.row === 7).map((s) => s.number)).toEqual([25, 26]);
    expect(at(27).row).toBe(8);
    // Back row: 47 48 49 50, left to right.
    expect(seats.filter((s) => s.side === "back").map((s) => [s.number, s.col])).toEqual([
      [47, 0],
      [48, 1],
      [49, 3],
      [50, 4],
    ]);
  });
  it("other buses: 2 + 1, a 5-seat back row across the aisle, no door, door on the left", () => {
    expect(seatCount({ rows: 10, left: 2, right: 1 })).toBe(30);
    const five = buildSeatMap({ rows: 10, left: 2, right: 2, back: 5 });
    expect(five.seats.filter((s) => s.side === "back").map((s) => s.col)).toEqual([0, 1, 2, 3, 4]);
    expect(seatCount({ rows: 12, left: 2, right: 2, doorRow: 6, doorSide: "left" })).toBe(46);
    expect(() => buildSeatMap({ rows: 3, left: 0, right: 0 })).toThrow();
    expect(() => buildSeatMap({ rows: 0, left: 2, right: 2 })).toThrow();
  });
});
