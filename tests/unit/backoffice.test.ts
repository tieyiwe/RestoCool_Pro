import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { scoreOf, APP_ACTIONS_CAP } = await import("@/lib/analytics/backoffice");
const { csvCell, HistoryFilter } = await import("@/lib/orders/history");

const zero = { served: 0, confirmed: 0, prepared: 0, taken: 0, minutes: 0, days: 0, appActions: 0 };

describe("personnel ranking score", () => {
  it("counts real work first, then presence, then app use (capped)", () => {
    expect(scoreOf(zero)).toBe(0);
    expect(scoreOf({ ...zero, served: 2, confirmed: 1 })).toBe(8);
    expect(scoreOf({ ...zero, minutes: 179, days: 1 })).toBe(4);
    expect(scoreOf({ ...zero, appActions: 10_000 })).toBe(APP_ACTIONS_CAP);
  });
});

describe("order history", () => {
  it("CSV cells are quoted and never run as spreadsheet formulas", () => {
    expect(csvCell('Riz "gras", sauce')).toBe('"Riz ""gras"", sauce"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(null)).toBe("");
    expect(csvCell(5300)).toBe("5300");
  });
  it("bad filters fall back to safe defaults", () => {
    expect(HistoryFilter.parse({ range: "1y", status: "x", staff: "nope" })).toEqual({ range: "today", status: "all", q: "", staff: undefined });
  });
});
