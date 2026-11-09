import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { inTimeWindow } = await import("@/lib/public-menu/load");
const { endOfLocalDay } = await import("@/lib/menu/service");

describe("time windows and « épuisé aujourd'hui »", () => {
  it("shows a lunch-only category only at lunch", () => {
    const w = { from: "11:30", to: "15:00" };
    expect(inTimeWindow(w, new Date("2026-11-09T12:00:00Z"))).toBe(true);
    expect(inTimeWindow(w, new Date("2026-11-09T19:00:00Z"))).toBe(false);
    expect(inTimeWindow(null, new Date())).toBe(true);
  });
  it("handles a window across midnight", () => {
    const night = { from: "22:00", to: "02:00" };
    expect(inTimeWindow(night, new Date("2026-11-09T23:30:00Z"))).toBe(true);
    expect(inTimeWindow(night, new Date("2026-11-09T01:00:00Z"))).toBe(true);
    expect(inTimeWindow(night, new Date("2026-11-09T12:00:00Z"))).toBe(false);
  });
  it("sold out until the next local midnight", () => {
    expect(endOfLocalDay(new Date("2026-11-09T18:45:00Z")).toISOString()).toBe("2026-11-10T00:00:00.000Z");
  });
});
