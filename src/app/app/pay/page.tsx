import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PayScreen, type PayData } from "@/components/cashier/pay-screen";
import { getDb } from "@/db";
import { can } from "@/lib/auth/can";
import { requireMemberPage } from "@/lib/auth/page";
import { BillError, billView, openBill } from "@/lib/billing";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("cashier"))("payTitle") };
}

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * « Encaisser »: the bill of a table (?session=) or of one order (?order=), opened then shown by
 * its id (?bill=) so a reload never opens a second bill.
 */
export default async function PayPage({ searchParams }: { searchParams: Promise<{ bill?: string; session?: string; order?: string }> }) {
  const ctx = await requireMemberPage("orders.pay");
  const sp = await searchParams;
  const t = await getTranslations("cashier");
  const svc = { db: getDb(), actor: ctx.actor, repo: ctx.repo };
  if (!sp.bill) {
    const target = sp.session && UUID.test(sp.session) ? { sessionId: sp.session } : sp.order && UUID.test(sp.order) ? { orderId: sp.order } : null;
    if (!target) redirect("/app/cashier");
    let billId: string | null = null;
    try {
      billId = (await openBill(svc, target)).id;
    } catch (err) {
      if (!(err instanceof BillError)) throw err;
      return (
        <div className="mx-auto max-w-md py-10 text-center" data-testid="pay-nothing">
          <p className="text-4xl">🧾</p>
          <p className="mt-2 font-semibold">{t(`errors.${err.code}`)}</p>
          <Link href="/app/cashier" className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-border px-4 font-bold">
            {t("backToCashier")}
          </Link>
        </div>
      );
    }
    redirect(`/app/pay?bill=${billId}`);
  }
  if (!UUID.test(sp.bill)) redirect("/app/cashier");
  const view = await billView(svc, sp.bill);
  const r = await ctx.repo.restaurant.get();
  const locale = (await getLocale()) as "fr" | "en" | "zh";
  const name = (n: { fr: string } & Record<string, string | undefined>) => n[locale] || n.fr;
  const data: PayData = {
    billId: view.bill.id,
    status: view.bill.status,
    seatLabel: view.bill.seatLabel,
    seatType: view.bill.seatType,
    subtotal: view.bill.subtotal,
    adjustment: view.bill.adjustment,
    discount: view.bill.discount,
    discountReason: view.bill.discountReason,
    total: view.bill.total,
    paid: view.bill.paid,
    due: view.due,
    hasOnRequest: view.hasOnRequest,
    customerPhone: view.orders.find((o) => o.customerPhone)?.customerPhone ?? null,
    customerName: view.orders.find((o) => o.customerName)?.customerName ?? null,
    orders: view.orders.map((o) => ({
      id: o.id,
      code: o.code,
      number: o.number,
      status: o.status,
      lines: o.items
        .filter((i) => i.status !== "cancelled")
        .map((i) => ({
          id: i.id,
          name: [name(i.nameSnapshot), i.variantName ? name(i.variantName) : null].filter(Boolean).join(" · "),
          qty: i.qty,
          unitPrice: i.unitPrice,
          note: i.note,
          paid: view.paidItems.has(i.id),
        })),
    })),
    payments: view.payments.map((p) => ({ id: p.id, method: p.method, amount: p.amount, reference: p.reference, splitLabel: p.splitLabel, at: p.createdAt.toISOString() })),
    canDiscount: can(ctx.actor, "orders.discount", { restaurantId: ctx.repo.restaurantId }),
    numbers: { orange: r?.orangeMoney ?? null, moov: r?.moovMoney ?? null },
    business: r?.name ?? "",
  };
  return <PayScreen data={data} />;
}
