import { describe, expect, it } from "vitest";
import { inactivityState, parseSkip, tableNumbers } from "@/lib/seating/tables";

describe("bulk tables", () => {
  it("numbers from..to without the skipped ones", () => {
    expect(tableNumbers(1, 20, parseSkip("13, 17"))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 18, 19, 20]);
  });
  it("rejects reversed or invalid ranges and caps at 200", () => {
    expect(tableNumbers(10, 1)).toEqual([]);
    expect(tableNumbers(0, 5)).toEqual([]);
    expect(tableNumbers(1, 999)).toHaveLength(200);
  });
  it("parses skip lists loosely", () => {
    expect(parseSkip("13 et 17; 20")).toEqual([13, 17, 20]);
    expect(parseSkip("")).toEqual([]);
  });
});

describe("inactivity release (4 min + 30 s)", () => {
  const t = { warnAfterSec: 240, releaseAfterSec: 30 };
  const start = 1_000_000;
  it("stays active before 4 minutes", () => {
    expect(inactivityState(start, start + 239_000, t)).toEqual({ phase: "active" });
  });
  it("warns with a countdown", () => {
    expect(inactivityState(start, start + 240_000, t)).toEqual({ phase: "warning", secondsLeft: 30 });
    expect(inactivityState(start, start + 260_500, t)).toEqual({ phase: "warning", secondsLeft: 10 });
  });
  it("releases after the countdown, even if the phone slept through it", () => {
    expect(inactivityState(start, start + 270_000, t)).toEqual({ phase: "release" });
    expect(inactivityState(start, start + 3_600_000, t)).toEqual({ phase: "release" });
  });
});
