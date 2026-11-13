import type { PersonRef } from "@/lib/personnel";
import type { OrderWithItems } from "./service";

/**
 * What a customer's phone receives: no device ids, no staff ids, no phone/address of others.
 * `current`: the order belongs to the session the phone is seated at now (its table bill),
 * not to an earlier visit of the last 24 h.
 */
export function publicOrder(o: OrderWithItems, deviceId: string, currentSessionId: string | null = null) {
  const mine = o.customerDeviceId === deviceId;
  return {
    id: o.id,
    number: o.number,
    code: o.code,
    status: o.status,
    mine,
    current: currentSessionId !== null && o.sessionId === currentSessionId,
    seat: o.seatType ? { type: o.seatType, label: o.seatLabel ?? "" } : null,
    customerName: mine ? o.customerName : null,
    pickupTime: mine ? (o.pickupTime ?? null) : null,
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
export function staffOrder(
  o: OrderWithItems,
  areaOf?: (seatId: string | null) => { id: string; name: { fr: string } & Partial<Record<string, string>> } | null,
  who?: (memberId: string | null) => PersonRef,
  /** Open table/room sessions: a served order there offers « Libérer la table ». */
  openTables?: ReadonlySet<string>,
) {
  return {
    /** Personnel who handled each step: name + matricule. */
    handledBy: who
      ? { confirmed: who(o.confirmedBy), prepared: who(o.preparedBy), served: who(o.servedBy), cancelled: who(o.cancelledBy) }
      : { confirmed: null, prepared: null, served: null, cancelled: null },
    area: areaOf ? areaOf(o.seatId) : null,
    id: o.id,
    number: o.number,
    code: o.code,
    status: o.status,
    validationMode: o.validationMode,
    source: o.source,
    seat: o.seatType ? { type: o.seatType, label: o.seatLabel ?? "" } : null,
    seatId: o.seatId,
    sessionId: o.sessionId,
    tableOpen: Boolean(o.sessionId && openTables?.has(o.sessionId)),
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    deliveryAddress: o.deliveryAddress,
    pickupTime: o.pickupTime,
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
