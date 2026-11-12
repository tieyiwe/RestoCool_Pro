import { describe, expect, it } from "vitest";
import { businessInitials, orderCode, parseOrderCode } from "@/lib/orders/code";

describe("order numbers", () => {
  it("takes the business's initials", () => {
    expect(businessInitials("Shangri-La")).toBe("SL");
    expect(businessInitials("Restaurant Démo")).toBe("RD");
    expect(businessInitials("Maquis Le Baobab")).toBe("MB");
    expect(businessInitials("Chez Fatou")).toBe("FA");
    expect(businessInitials("Karité")).toBe("KA");
    expect(businessInitials("Le Bon Coin Du Quartier Sud")).toBe("BCQ");
  });
  it("builds a full number with the date and the day's number, and reads it back", () => {
    const code = orderCode("SL", "2026-11-12", 7);
    expect(code).toBe("SL-261112-007");
    expect(parseOrderCode(code)).toEqual({ businessDate: "2026-11-12", number: 7 });
    expect(parseOrderCode("sl261112-7")).toEqual({ businessDate: "2026-11-12", number: 7 });
    expect(parseOrderCode("Table 4")).toBeNull();
  });
});
