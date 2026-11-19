import { describe, expect, it } from "vitest";
import { modesFor, serviceTypes } from "@/lib/restaurants/service-types";

describe("service types (sur place / à emporter / livraison)", () => {
  it("reads them from the seating modes", () => {
    expect(serviceTypes({ seatingModes: ["table", "takeaway"] })).toEqual({ dineIn: true, takeaway: true, delivery: false });
    expect(serviceTypes({ seatingModes: ["takeaway", "delivery"] })).toEqual({ dineIn: false, takeaway: true, delivery: true });
    expect(serviceTypes({ seatingModes: ["counter"] }).dineIn).toBe(true);
    expect(serviceTypes(undefined)).toEqual({ dineIn: true, takeaway: true, delivery: false });
  });
  it("saves dine-in places only when « Sur place » is chosen (tables by default)", () => {
    expect(modesFor({ dineIn: true, takeaway: true, delivery: true }, ["table", "room", "takeaway"])).toEqual(["table", "room", "takeaway", "delivery"]);
    expect(modesFor({ dineIn: true, takeaway: false, delivery: false }, [])).toEqual(["table"]);
    expect(modesFor({ dineIn: false, takeaway: true, delivery: true }, ["table", "room"])).toEqual(["takeaway", "delivery"]);
    expect(modesFor({ dineIn: false, takeaway: false, delivery: false }, ["table"])).toEqual([]);
  });
});
