import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { closeDb, getDb } = await import("@/db");
const { tenantRepo } = await import("@/db/repos/tenant");
const { auditLog, bills, menuCategories, menuItems, orders, paymentIntents, payments, restaurants, tableSessions } = await import("@/db/schema");
const sessions = await import("@/lib/seating/sessions");
const admin = await import("@/lib/seating/admin");
const svc = await import("@/lib/orders/service");
const billing = await import("@/lib/billing");
const { settleIntent } = await import("@/payments/service");
const { createRestaurantForUser } = await import("@/lib/restaurants/provision");
const { ForbiddenError, NotFoundError } = await import("@/lib/errors");

const hasDb = Boolean(process.env.DATABASE_URL);
const PHONE = "billPhoneAAAAAAAAAAAAA";
const PHONE2 = "billPhoneBBBBBBBBBBBBB";

describe.skipIf(!hasDb)("billing and the payment layer (database)", () => {
  type R = typeof restaurants.$inferSelect;
  type Ctx = Parameters<typeof billing.openBill>[0];
  const ids: string[] = [];
  let r: R;
  let other: R;
  let owner: Ctx;
  let server: Ctx;
  let kitchen: Ctx;
  let otherOwner: Ctx;
  let rizId: string;
  let bissapId: string;
  let table: { id: string; type: string; label: string };

  const order = async (sessionId: string, device: string, lines: Array<{ itemId: string; qty: number }>) =>
    svc.placeCustomerOrder(getDb(), r, device, { sessionId, lines: lines.map((l) => ({ ...l, variantId: null, optionIds: [] })) });
  const seated = async (label: string, device: string) => {
    const seat = (await owner.repo.seating.seats()).find((s) => s.type === "table" && s.label === label)!;
    const j = await sessions.joinSession(getDb(), r, { seat: { id: seat.id, type: seat.type, label: seat.label }, deviceId: device, source: "qr" });
    if (!j.ok) throw new Error("join");
    return j.sessionId;
  };

  beforeAll(async () => {
    const db = getDb();
    r = await createRestaurantForUser(db, { clerkUserId: "it-bill-a" }, { name: "Maquis Caisse", city: "Ouagadougou" });
    other = await createRestaurantForUser(db, { clerkUserId: "it-bill-b" }, { name: "Maquis Caisse Voisin", city: "Ouagadougou" });
    ids.push(r.id, other.id);
    owner = { db, actor: { kind: "member", userId: "it-bill-a", restaurantId: r.id, role: "owner" }, repo: tenantRepo(db, r.id) };
    server = { db, actor: { kind: "member", userId: "it-bill-s", restaurantId: r.id, role: "server" }, repo: tenantRepo(db, r.id) };
    kitchen = { db, actor: { kind: "member", userId: "it-bill-k", restaurantId: r.id, role: "kitchen" }, repo: tenantRepo(db, r.id) };
    otherOwner = { db, actor: { kind: "member", userId: "it-bill-b", restaurantId: other.id, role: "owner" }, repo: tenantRepo(db, other.id) };
    const [cat] = await db.insert(menuCategories).values({ restaurantId: r.id, name: { fr: "Plats" } }).returning();
    const [riz, bissap] = await db
      .insert(menuItems)
      .values([
        { restaurantId: r.id, categoryId: cat!.id, name: { fr: "Riz gras" }, price: 2500 },
        { restaurantId: r.id, categoryId: cat!.id, name: { fr: "Jus de bissap" }, price: 500 },
      ])
      .returning();
    rizId = riz!.id;
    bissapId = bissap!.id;
    await admin.addTables(owner, { from: 1, to: 4, skip: [], areaId: null, capacity: null });
    const seat = (await owner.repo.seating.seats()).find((s) => s.type === "table" && s.label === "1")!;
    table = { id: seat.id, type: seat.type, label: seat.label };
  });
  afterAll(async () => {
    await getDb().delete(restaurants).where(inArray(restaurants.id, ids));
    await closeDb();
  });

  it("a table's bill: two phones' orders, cash with change, the orders become paid and the table frees itself", async () => {
    const db = getDb();
    const s = await seated("1", PHONE);
    await sessions.joinSession(db, r, { seat: table, deviceId: PHONE2, source: "qr" });
    const a = await order(s, PHONE, [{ itemId: rizId, qty: 2 }]);
    const b = await order(s, PHONE2, [{ itemId: bissapId, qty: 3 }]);
    for (const o of [a, b]) {
      if (o.status === "sent") await svc.setOrderStatus(owner, o.id, "confirmed");
      await svc.setOrderStatus(owner, o.id, "served");
    }
    // Kitchen staff cannot take money.
    await expect(billing.openBill(kitchen, { sessionId: s })).rejects.toBeInstanceOf(ForbiddenError);
    const bill = await billing.openBill(server, { sessionId: s });
    expect(bill).toMatchObject({ subtotal: 6500, total: 6500, paid: 0, seatLabel: "1" });
    expect(bill.orderIds.sort()).toEqual([a.id, b.id].sort());
    // The same table again: the same bill.
    expect((await billing.openBill(server, { sessionId: s })).id).toBe(bill.id);
    // Not enough cash handed over is refused; then 10 000 F → 3 500 F change.
    await expect(billing.payBill(server, bill.id, { method: "cash", received: 5000, requestId: "req-cash-low" })).rejects.toMatchObject({ code: "received_too_low" });
    const res = await billing.payBill(server, bill.id, { method: "cash", received: 10_000, requestId: "req-cash-ok" });
    expect(res).toMatchObject({ settled: true, change: 3500 });
    const paid = await db.select({ status: orders.status, paidAt: orders.paidAt, billId: orders.billId }).from(orders).where(inArray(orders.id, [a.id, b.id]));
    expect(paid.every((o) => o.status === "paid" && o.paidAt && o.billId === bill.id)).toBe(true);
    const [sess] = await db.select().from(tableSessions).where(eq(tableSessions.id, s));
    expect(sess).toMatchObject({ status: "closed", closedReason: "paid" });
    const [p] = await db.select().from(payments).where(eq(payments.billId, bill.id));
    expect(p).toMatchObject({ method: "cash", amount: 6500, received: 10_000, changeGiven: 3500 });
    // The same request sent again (lost answer on a bad network) records nothing more.
    await expect(billing.payBill(server, bill.id, { method: "cash", received: 10_000, requestId: "req-cash-ok" })).rejects.toMatchObject({ code: "already_paid" });
    expect(await db.select().from(payments).where(eq(payments.billId, bill.id))).toHaveLength(1);
    // Every intent step is in the audit log.
    const steps = await db.select({ action: auditLog.action }).from(auditLog).where(and(eq(auditLog.restaurantId, r.id), eq(auditLog.entity, "payment_intent")));
    expect(steps.map((x) => x.action)).toEqual(expect.arrayContaining(["payment.intent.created", "payment.intent.succeeded"]));
  });

  it("split in equal parts with different methods; mobile money needs its reference", async () => {
    const s = await seated("2", PHONE);
    const o = await order(s, PHONE, [{ itemId: rizId, qty: 3 }]);
    const bill = await billing.openBill(server, { sessionId: s });
    expect(bill.total).toBe(7500);
    await expect(billing.payBill(server, bill.id, { method: "orange_money", amount: 2500, requestId: "split-1" })).rejects.toMatchObject({ code: "reference_required" });
    expect((await billing.payBill(server, bill.id, { method: "orange_money", amount: 2500, reference: "OM123456", splitLabel: "1/3", requestId: "split-1" })).settled).toBe(false);
    expect((await billing.payBill(server, bill.id, { method: "moov_money", amount: 2500, reference: "MV777", splitLabel: "2/3", requestId: "split-2" })).settled).toBe(false);
    // More than what is left is refused.
    await expect(billing.payBill(server, bill.id, { method: "cash", amount: 3000, requestId: "split-3x" })).rejects.toMatchObject({ code: "too_much" });
    // Amounts can no longer change once money was taken.
    await expect(billing.setBillAmounts(owner, bill.id, { adjustment: 0, discount: 500, discountReason: "Fidèle" })).rejects.toMatchObject({ code: "locked" });
    expect((await billing.payBill(server, bill.id, { method: "cash", splitLabel: "3/3", requestId: "split-3" })).settled).toBe(true);
    const view = await billing.billView(owner, bill.id);
    expect(view.payments.map((p) => [p.method, p.amount, p.reference, p.splitLabel])).toEqual([
      ["orange_money", 2500, "OM123456", "1/3"],
      ["moov_money", 2500, "MV777", "2/3"],
      ["cash", 2500, null, "3/3"],
    ]);
    expect(view.due).toBe(0);
    expect((await getDb().select({ status: orders.status }).from(orders).where(eq(orders.id, o.id)))[0]!.status).toBe("paid");
  });

  it("pay by dish: the amount comes from the dishes chosen, computed on the server", async () => {
    const s = await seated("3", PHONE);
    const o = await order(s, PHONE, [
      { itemId: rizId, qty: 1 },
      { itemId: bissapId, qty: 2 },
    ]);
    const bill = await billing.openBill(server, { sessionId: s });
    const view = await billing.billView(server, bill.id);
    const rizLine = view.orders[0]!.items.find((i) => i.itemId === rizId)!;
    // A wrong amount sent by the client is ignored: the dish decides.
    const first = await billing.payBill(server, bill.id, { method: "cash", amount: 1, items: [rizLine.id], requestId: "dish-1" });
    expect(first.settled).toBe(false);
    const after = await billing.billView(server, bill.id);
    expect(after.payments[0]!.amount).toBe(2500);
    expect(after.paidItems.has(rizLine.id)).toBe(true);
    expect(after.due).toBe(1000);
    expect((await billing.payBill(server, bill.id, { method: "cash", requestId: "dish-2" })).settled).toBe(true);
    expect((await getDb().select({ status: orders.status }).from(orders).where(eq(orders.id, o.id)))[0]!.status).toBe("paid");
  });

  it("discounts need a reason and the right; above 20 % only a manager or the owner; « sur demande » price added", async () => {
    const s = await seated("4", PHONE);
    await order(s, PHONE, [{ itemId: rizId, qty: 4 }]); // 10 000 F
    const bill = await billing.openBill(server, { sessionId: s });
    // A server has no « remise » right.
    await expect(billing.setBillAmounts(server, bill.id, { adjustment: 0, discount: 500, discountReason: "Fidèle" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(billing.setBillAmounts(owner, bill.id, { adjustment: 0, discount: 500 })).rejects.toMatchObject({ code: "discount_reason" });
    // A cashier-level person with the right is limited to 20 %; the owner is not.
    const cashierLead = { ...owner, actor: { kind: "member" as const, userId: "it-bill-c", restaurantId: r.id, role: "cashier" as const } };
    const can = await import("@/lib/auth/can");
    if (can.can(cashierLead.actor, "orders.discount", { restaurantId: r.id })) {
      await expect(billing.setBillAmounts(cashierLead, bill.id, { adjustment: 0, discount: 5000, discountReason: "Erreur" })).rejects.toMatchObject({ code: "discount_approval" });
    }
    const set = await billing.setBillAmounts(owner, bill.id, { adjustment: 3000, discount: 3000, discountReason: "Anniversaire du client" });
    expect(set).toMatchObject({ subtotal: 10_000, adjustment: 3000, discount: 3000, total: 10_000, discountReason: "Anniversaire du client" });
    await expect(billing.setBillAmounts(owner, bill.id, { adjustment: 0, discount: 20_000, discountReason: "x" })).rejects.toMatchObject({ code: "discount_too_big" });
    expect((await billing.payBill(owner, bill.id, { method: "card", reference: "CB-1", requestId: "disc-pay" })).settled).toBe(true);
  });

  it("a 100 % discount settles the bill without money", async () => {
    const s = await seated("1", PHONE);
    const o = await order(s, PHONE, [{ itemId: bissapId, qty: 1 }]);
    const bill = await billing.openBill(owner, { orderId: o.id });
    await billing.setBillAmounts(owner, bill.id, { adjustment: 0, discount: 500, discountReason: "Offert par la maison" });
    expect((await billing.payBill(owner, bill.id, { method: "cash", requestId: "free-1" })).settled).toBe(true);
    expect((await getDb().select({ status: orders.status }).from(orders).where(eq(orders.id, o.id)))[0]!.status).toBe("paid");
    expect(await getDb().select().from(payments).where(eq(payments.billId, bill.id))).toHaveLength(0);
  });

  it("settling the same intent twice changes nothing (webhooks are idempotent)", async () => {
    const db = getDb();
    const [i] = await db.select().from(paymentIntents).where(eq(paymentIntents.restaurantId, r.id)).limit(1);
    const before = await db.select().from(payments).where(eq(payments.restaurantId, r.id));
    const again = await settleIntent(db, i!.id, i!.providerRef);
    expect(again.status).toBe("succeeded");
    expect(await db.select().from(payments).where(eq(payments.restaurantId, r.id))).toHaveLength(before.length);
  });

  it("never shows or takes money for another business's bills", async () => {
    const [b] = await getDb().select().from(bills).where(eq(bills.restaurantId, r.id)).limit(1);
    await expect(billing.billView(otherOwner, b!.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(billing.payBill(otherOwner, b!.id, { method: "cash", requestId: "foreign-1" })).rejects.toBeInstanceOf(NotFoundError);
    expect(await billing.toCollect(otherOwner)).toEqual([]);
  });

  it("keeps « Payer maintenant » hidden until a working provider is connected", async () => {
    const db = getDb();
    const { onlinePayMethods, startCustomerPayment, CustomerPayError } = await import("@/payments/customer");
    const { paymentProviderConfigs } = await import("@/db/schema");
    expect(await onlinePayMethods(db, r.id)).toEqual([]);
    // A stub provider (adapter not written yet) never turns the button on, even enabled with credentials.
    await db.insert(paymentProviderConfigs).values({ restaurantId: r.id, provider: "orange_money", enabled: true, credentialsEncrypted: "x.y.z" });
    expect(await onlinePayMethods(db, r.id)).toEqual([]);
    const [o] = await db.select().from(orders).where(eq(orders.restaurantId, r.id)).limit(1);
    await expect(startCustomerPayment(db, r, PHONE, { method: "orange_money", orderId: o!.id, requestId: "custpay-1" }, "http://localhost")).rejects.toBeInstanceOf(CustomerPayError);
  });

  it("refuses webhooks for unknown providers and businesses without a connected provider", async () => {
    const { handlePaymentWebhook } = await import("@/payments/webhook");
    const req = () => new Request("http://localhost/api/webhooks/payments/x", { method: "POST", body: "{}" });
    expect((await handlePaymentWebhook(req(), "nope", null)).status).toBe(404);
    expect((await handlePaymentWebhook(req(), "manual", null)).status).toBe(404);
    expect((await handlePaymentWebhook(req(), "cinetpay", other.id)).status).toBe(404);
  });
});
