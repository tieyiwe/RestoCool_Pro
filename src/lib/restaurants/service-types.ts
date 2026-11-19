/**
 * How a business serves its customers, from its seating modes (one source of truth):
 *  - « Sur place » (dine-in): tables, areas, private rooms or a counter;
 *  - « À emporter » (takeaway);
 *  - « Livraison » (delivery).
 * Chosen at creation (setup wizard, step « Service ») and changed any time in Paramètres → Service.
 * Without dine-in, the app hides tables, the floor plan, « Mes tables », assignments and
 * reservations, and puts takeaway / delivery first.
 */
export const DINE_IN_MODES = ["table", "area", "room", "counter"] as const;
export type ServiceTypes = { dineIn: boolean; takeaway: boolean; delivery: boolean };

export function serviceTypes(settings: { seatingModes?: readonly string[] } | null | undefined): ServiceTypes {
  const modes = settings?.seatingModes ?? ["table", "takeaway"];
  return {
    dineIn: modes.some((m) => (DINE_IN_MODES as readonly string[]).includes(m)),
    takeaway: modes.includes("takeaway"),
    delivery: modes.includes("delivery"),
  };
}

/** The seating modes saved for a choice of service types (dine-in places default to tables). */
export function modesFor(types: ServiceTypes, dineInPlaces: readonly string[]): Array<"table" | "area" | "room" | "counter" | "takeaway" | "delivery"> {
  const places = dineInPlaces.filter((m): m is (typeof DINE_IN_MODES)[number] => (DINE_IN_MODES as readonly string[]).includes(m));
  return [...(types.dineIn ? (places.length ? places : (["table"] as const)) : []), ...(types.takeaway ? (["takeaway"] as const) : []), ...(types.delivery ? (["delivery"] as const) : [])];
}
