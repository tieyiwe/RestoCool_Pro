import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { bills, orderItems, orders, payments, restaurants, type Bill } from "@/db/schema";
import { PAYMENT_METHODS } from "@/db/schema/payments";
import { writeAudit } from "@/lib/audit";
import { NotFoundError } from "@/lib/errors";
import { actorTag, memberIdOf, need, withItems, type ServiceCtx } from "@/lib/orders/service";
import { notify } from "@/lib/realtime/events";
import { startPayment } from "@/payments/service";

/** Orders a bill can cover: everything not paid and not cancelled. */
const UNPAID = ["sent", "confirmed", "preparing", "ready", "served"] as const;
/** Discounts above this share of the bill need a manager or the owner (changeable per business). */
export const DEFAULT_DISCOUNT_APPROVAL_PERCENT = 20;

export class BillError extends Error {
  constructor(readonly code: "nothing_to_pay" | "already_paid" | "locked" | "too_much" | "reference_required" | "received_too_low" | "discount_reason" | "discount_approval" | "discount_too_big" | "invalid") {
    super(code);
  }
}

const today = (now: Date) => now.toISOString().slice(0, 10);
const totalOf = (b: Pick<Bill, "subtotal" | "adjustment" | "discount">) => Math.max(0, b.subtotal + b.adjustment - b.discount);

/**
 * The bill of a table (session) or of one order: opened on first use and kept up to date (new
 * orders join it) until the first payment freezes what it covers.
 */
export async function openBill(ctx: ServiceCtx, target: { orderId: string } | { sessionId: string }, now = new Date()): Promise<Bill> {
  need(ctx, "orders.pay");
  const rid = ctx.repo.restaurantId;
  let list;
  let sessionId: string | null = null;
  if ("sessionId" in target) {
    sessionId = target.sessionId;
    list = await ctx.db
      .select()
      .from(orders)
      .where(and(eq(orders.restaurantId, rid), eq(orders.sessionId, target.sessionId), inArray(orders.status, [...UNPAID])))
      .orderBy(asc(orders.sentAt));
  } else {
    const [o] = await ctx.db.select().from(orders).where(and(eq(orders.restaurantId, rid), eq(orders.id, target.orderId)));
    if (!o) throw new NotFoundError();
    if (o.status === "paid") {
      const [b] = o.billId ? await ctx.db.select().from(bills).where(and(eq(bills.id, o.billId), eq(bills.restaurantId, rid))) : [];
      if (b) return b;
      throw new BillError("already_paid");
    }
    if (o.status === "cancelled") throw new BillError("nothing_to_pay");
    sessionId = o.sessionId;
    list = [o];
  }
  // A bill already open for the same thing (with or without payments) is reused.
  const open = await ctx.db
    .select()
    .from(bills)
    .where(and(eq(bills.restaurantId, rid), eq(bills.status, "open"), "sessionId" in target ? eq(bills.sessionId, target.sessionId) : sql`${bills.orderIds} = array[${target.orderId}]::uuid[]`))
    .orderBy(desc(bills.createdAt))
    .limit(1);
  const existing = open[0];
  if (existing && existing.paid > 0) return existing;
  if (list.length === 0) {
    if (existing) return existing;
    throw new BillError("nothing_to_pay");
  }
  const subtotal = list.reduce((s, o) => s + o.subtotal, 0);
  const first = list[0]!;
  const values = {
    orderIds: list.map((o) => o.id),
    subtotal,
    seatLabel: first.seatLabel,
    seatType: first.seatType,
    sessionId,
    updatedAt: now,
  };
  if (existing) {
    const [b] = await ctx.db
      .update(bills)
      .set({ ...values, total: totalOf({ subtotal, adjustment: existing.adjustment, discount: Math.min(existing.discount, subtotal + existing.adjustment) }) })
      .where(eq(bills.id, existing.id))
      .returning();
    return b!;
  }
  const [b] = await ctx.db
    .insert(bills)
    .values({ restaurantId: rid, ...values, total: subtotal, createdBy: await memberIdOf(ctx) })
    .returning();
  return b!;
}

/** A bill with its orders (dishes), payments and what is still due. */
export async function billView(ctx: ServiceCtx, billId: string) {
  need(ctx, "orders.pay");
  const rid = ctx.repo.restaurantId;
  const [bill] = await ctx.db.select().from(bills).where(and(eq(bills.id, billId), eq(bills.restaurantId, rid)));
  if (!bill) throw new NotFoundError();
  const [list, paid] = await Promise.all([
    ctx.db.select().from(orders).where(and(eq(orders.restaurantId, rid), inArray(orders.id, bill.orderIds))).orderBy(asc(orders.sentAt)),
    ctx.db.select().from(payments).where(and(eq(payments.restaurantId, rid), eq(payments.billId, bill.id))).orderBy(asc(payments.createdAt)),
  ]);
  const withLines = await withItems(ctx.db, rid, list);
  const hasOnRequest = list.some((o) => o.hasOnRequest);
  const paidItems = new Set(paid.flatMap((p) => p.items ?? []));
  return { bill, orders: withLines, payments: paid, due: Math.max(0, bill.total - bill.paid), hasOnRequest, paidItems };
}

export const AmountsInput = z.object({
  adjustment: z.coerce.number().int().min(0).max(10_000_000).default(0),
  discount: z.coerce.number().int().min(0).max(10_000_000).default(0),
  discountReason: z.string().trim().max(200).optional(),
});

/**
 * Price of « sur demande » dishes and the discount, before any payment. A discount needs a
 * reason and the « remise » right; above the business's threshold (default 20 %) only a manager
 * or the owner may give it.
 */
export async function setBillAmounts(ctx: ServiceCtx, billId: string, input: z.infer<typeof AmountsInput>, now = new Date()): Promise<Bill> {
  need(ctx, "orders.pay");
  const rid = ctx.repo.restaurantId;
  const [bill] = await ctx.db.select().from(bills).where(and(eq(bills.id, billId), eq(bills.restaurantId, rid)));
  if (!bill) throw new NotFoundError();
  if (bill.status !== "open") throw new BillError("already_paid");
  if (bill.paid > 0) throw new BillError("locked");
  const gross = bill.subtotal + input.adjustment;
  if (input.discount > 0) {
    need(ctx, "orders.discount");
    if (!input.discountReason) throw new BillError("discount_reason");
    if (input.discount > gross) throw new BillError("discount_too_big");
    const [r] = await ctx.db.select({ settings: restaurants.settings }).from(restaurants).where(eq(restaurants.id, rid));
    const limit = (r?.settings as { payments?: { discountApprovalPercent?: number } } | undefined)?.payments?.discountApprovalPercent ?? DEFAULT_DISCOUNT_APPROVAL_PERCENT;
    const lead = ctx.actor.kind === "member" && (ctx.actor.role === "owner" || ctx.actor.role === "manager");
    if (gross > 0 && (input.discount / gross) * 100 > limit && !lead) throw new BillError("discount_approval");
  }
  const by = input.discount > 0 ? await memberIdOf(ctx) : null;
  const [b] = await ctx.db
    .update(bills)
    .set({
      adjustment: input.adjustment,
      discount: input.discount,
      discountReason: input.discount > 0 ? input.discountReason!.slice(0, 200) : null,
      discountBy: by,
      total: Math.max(0, gross - input.discount),
      updatedAt: now,
    })
    .where(eq(bills.id, bill.id))
    .returning();
  if (input.discount > 0) {
    await writeAudit(ctx.db, ctx.actor, { restaurantId: rid, action: "bill.discount", entity: "bill", entityId: bill.id, data: { discount: input.discount, reason: input.discountReason, gross } });
  }
  return b!;
}

export const PayInput = z.object({
  method: z.enum(PAYMENT_METHODS),
  /** Amount of this payment (FCFA); the rest of the bill if absent. */
  amount: z.coerce.number().int().positive().optional(),
  /** Cash handed over by the customer. */
  received: z.coerce.number().int().min(0).optional(),
  reference: z.string().trim().max(80).optional(),
  /** Split bill: « 2/3 », or the dishes this part pays for. */
  splitLabel: z.string().trim().max(20).optional(),
  items: z.array(z.uuid()).max(200).optional(),
  /** Client-made key: the same payment sent twice is recorded once. */
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
});

/**
 * Records money received for a bill (the whole bill, or one part of a split bill). Goes through
 * the payment layer (provider « manual »), so the bill, the orders and the table update exactly as
 * an online payment will later. Mobile money needs the transaction reference; cash keeps what was
 * handed over and the change.
 */
export async function payBill(ctx: ServiceCtx, billId: string, input: z.infer<typeof PayInput>, now = new Date()) {
  need(ctx, "orders.pay");
  const rid = ctx.repo.restaurantId;
  const [bill] = await ctx.db.select().from(bills).where(and(eq(bills.id, billId), eq(bills.restaurantId, rid)));
  if (!bill) throw new NotFoundError();
  if (bill.status !== "open") throw new BillError("already_paid");
  const due = bill.total - bill.paid;
  const staffId = await memberIdOf(ctx);
  // Everything offered (100 % discount): settled without money.
  if (due <= 0) {
    await settleFreeBill(ctx, bill, staffId, now);
    return { settled: true, change: 0, billId: bill.id };
  }
  let amount = input.amount ?? due;
  if (input.items?.length) {
    // Paying for some dishes: the amount is computed here from those dishes.
    const lines = await ctx.db
      .select({ id: orderItems.id, price: orderItems.unitPrice, qty: orderItems.qty })
      .from(orderItems)
      .where(and(eq(orderItems.restaurantId, rid), inArray(orderItems.orderId, bill.orderIds), inArray(orderItems.id, input.items)));
    if (lines.length !== new Set(input.items).size) throw new BillError("invalid");
    amount = Math.min(due, lines.reduce((s, l) => s + (l.price ?? 0) * l.qty, 0));
    if (amount <= 0) throw new BillError("invalid");
  }
  if (amount > due) throw new BillError("too_much");
  if ((input.method === "orange_money" || input.method === "moov_money") && !input.reference) throw new BillError("reference_required");
  let changeGiven: number | undefined;
  if (input.method === "cash" && input.received !== undefined) {
    if (input.received < amount) throw new BillError("received_too_low");
    changeGiven = input.received - amount;
  }
  const res = await startPayment(
    ctx.db,
    {
      restaurantId: rid,
      // One order → « order »; a table's bill → « session » (section 8b purposes).
      purpose: bill.orderIds.length === 1 || !bill.sessionId ? "order" : "session",
      purposeId: bill.orderIds.length === 1 || !bill.sessionId ? bill.orderIds[0]! : bill.sessionId,
      billId: bill.id,
      amount,
      method: input.method,
      idempotencyKey: `bill:${bill.id}:${input.requestId}`,
      createdBy: actorTag(ctx.actor),
      actor: ctx.actor,
      metadata: {
        staffId,
        ...(input.method === "cash" && input.received !== undefined ? { received: input.received, changeGiven } : {}),
        ...(input.reference ? { reference: input.reference } : {}),
        ...(input.splitLabel ? { splitLabel: input.splitLabel } : {}),
        ...(input.items?.length ? { items: input.items } : {}),
      },
      description: `${bill.seatLabel ?? ""} ${amount} F`.trim(),
    },
    undefined,
    now,
  );
  const [after] = await ctx.db.select({ status: bills.status }).from(bills).where(eq(bills.id, bill.id));
  return { settled: after?.status === "paid", change: changeGiven ?? 0, billId: bill.id, reused: res.reused };
}

async function settleFreeBill(ctx: ServiceCtx, bill: Bill, staffId: string | null, now: Date) {
  const rid = ctx.repo.restaurantId;
  await ctx.db.transaction(async (tx) => {
    await tx.update(bills).set({ status: "paid", closedAt: now, businessDate: today(now), updatedAt: now }).where(eq(bills.id, bill.id));
    const done = await tx
      .update(orders)
      .set({ status: "paid", paidAt: now, paidBy: staffId, billId: bill.id, updatedBy: actorTag(ctx.actor), updatedAt: now })
      .where(and(eq(orders.restaurantId, rid), inArray(orders.id, bill.orderIds), sql`${orders.status} <> 'cancelled'`))
      .returning({ id: orders.id, s: orders.sessionId, d: orders.customerDeviceId });
    for (const o of done) await notify(tx, { k: "order", r: rid, o: o.id, s: o.s, d: o.d });
    await writeAudit(tx, ctx.actor, { restaurantId: rid, action: "bill.offered", entity: "bill", entityId: bill.id, data: { discount: bill.discount } });
  });
}

/** Unpaid orders grouped as bills to collect (« À encaisser »): tables first, then single orders. */
export async function toCollect(ctx: ServiceCtx) {
  need(ctx, "orders.pay");
  const rid = ctx.repo.restaurantId;
  const list = await ctx.db
    .select()
    .from(orders)
    .where(and(eq(orders.restaurantId, rid), inArray(orders.status, [...UNPAID])))
    .orderBy(asc(orders.sentAt))
    .limit(300);
  const groups = new Map<string, { key: string; sessionId: string | null; orderId: string | null; seatLabel: string | null; seatType: string | null; orders: typeof list; total: number; served: boolean; since: Date }>();
  for (const o of list) {
    const k = o.sessionId && (o.seatType === "table" || o.seatType === "room") ? `s:${o.sessionId}` : `o:${o.id}`;
    const g = groups.get(k) ?? { key: k, sessionId: k.startsWith("s:") ? o.sessionId : null, orderId: k.startsWith("o:") ? o.id : null, seatLabel: o.seatLabel, seatType: o.seatType, orders: [], total: 0, served: true, since: o.sentAt };
    g.orders.push(o);
    g.total += o.subtotal;
    g.served = g.served && o.status === "served";
    groups.set(k, g);
  }
  return [...groups.values()].sort((a, b) => Number(b.served) - Number(a.served) || a.since.getTime() - b.since.getTime());
}
