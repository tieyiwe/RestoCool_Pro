import type { OrderWithItems } from "./service";

/** What a customer's phone receives: no device ids, no staff ids, no phone/address of others. */
export function publicOrder(o: OrderWithItems, deviceId: string) {
  const mine = o.customerDeviceId === deviceId;
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    mine,
    seat: o.seatType ? { type: o.seatType, label: o.seatLabel ?? "" } : null,
    customerName: mine ? o.customerName : null,
    subtotal: o.subtotal,
    hasOnRequest: o.hasOnRequest,
    sentAt: o.sentAt.toISOString(),
    confirmedAt: o.confirmedAt?.toISOString() ?? null,
    readyAt: o.readyAt?.toISOString() ?? null,
    servedAt: o.servedAt?.toISOString() ?? null,
    cancelledReason: mine ? o.cancelledReason : null,
    items: o.items.map((i) => ({
      id: i.id,
      itemId: i.itemId,
      variantId: i.variantId,
      optionIds: i.options.map((x) => x.id),
      code: i.code,
      name: i.nameSnapshot,
      variantName: i.variantName,
      options: i.options.map((x) => x.name),
      unitPrice: i.unitPrice,
      qty: i.qty,
      note: i.note,
      status: i.status,
    })),
  };
}
export type PublicOrder = ReturnType<typeof publicOrder>;

/** Front desk and kitchen view of an order. */
export function staffOrder(o: OrderWithItems, areaOf?: (seatId: string | null) => { id: string; name: { fr: string } & Partial<Record<string, string>> } | null) {
  return {
    area: areaOf ? areaOf(o.seatId) : null,
    id: o.id,
    number: o.number,
    status: o.status,
    validationMode: o.validationMode,
    source: o.source,
    seat: o.seatType ? { type: o.seatType, label: o.seatLabel ?? "" } : null,
    seatId: o.seatId,
    sessionId: o.sessionId,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    deliveryAddress: o.deliveryAddress,
    subtotal: o.subtotal,
    hasOnRequest: o.hasOnRequest,
    note: o.note,
    sentAt: o.sentAt.toISOString(),
    confirmedAt: o.confirmedAt?.toISOString() ?? null,
    preparingAt: o.preparingAt?.toISOString() ?? null,
    readyAt: o.readyAt?.toISOString() ?? null,
    servedAt: o.servedAt?.toISOString() ?? null,
    items: o.items.map((i) => ({
      id: i.id,
      code: i.code,
      name: i.nameSnapshot,
      variantName: i.variantName,
      options: i.options.map((x) => x.name),
      unitPrice: i.unitPrice,
      qty: i.qty,
      note: i.note,
      station: i.station,
      status: i.status,
    })),
  };
}
export type StaffOrder = ReturnType<typeof staffOrder>;
