import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { PrintButton } from "@/components/print-button";
import { getDb } from "@/db";
import { requireMemberPage } from "@/lib/auth/page";
import { receiptData } from "@/lib/billing";
import { formatBfPhone, formatFCFA } from "@/lib/format";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("cashier"))("receipt") };
}

/**
 * The receipt of a bill: print it (or « Enregistrer en PDF » from the print window) on a till
 * printer or A4, or send it as a WhatsApp message.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireMemberPage("orders.pay");
  const [t, format, locale] = await Promise.all([getTranslations("cashier"), getFormatter(), getLocale()]);
  const d = await receiptData({ db: getDb(), actor: ctx.actor, repo: ctx.repo }, id).catch(() => null);
  if (!d || !d.restaurant) notFound();
  const r = d.restaurant;
  const F = (n: number) => formatFCFA(n) ?? "0 F";
  const pick = (n: { fr: string } & Record<string, string | undefined>) => n[locale] || n.fr;
  const when = d.bill.closedAt ?? d.bill.updatedAt;
  const no = d.orders[0]?.code ?? d.bill.id.slice(0, 8).toUpperCase();
  const seat = d.bill.seatType === "table" ? t("table", { label: d.bill.seatLabel ?? "" }) : d.bill.seatType === "room" ? t("room", { label: d.bill.seatLabel ?? "" }) : (d.bill.seatLabel ?? "");
  const lines = d.orders.flatMap((o) => o.items.filter((i) => i.status !== "cancelled"));
  const text = [
    `${r.name}`,
    `${t("receipt")} ${no} · ${format.dateTime(when, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
    seat,
    "",
    ...lines.map((l) => `${l.qty} × ${pick(l.nameSnapshot)}${l.unitPrice !== null ? ` : ${F(l.unitPrice * l.qty)}` : ""}`),
    "",
    ...(d.bill.adjustment ? [`${t("onRequestAmount")} : ${F(d.bill.adjustment)}`] : []),
    ...(d.bill.discount ? [`${t("discount")} : − ${F(d.bill.discount)}`] : []),
    `${t("total")} : ${F(d.bill.total)}`,
    ...d.payments.map((p) => `${t(`methods.${p.method}`)} : ${F(p.amount)}${p.reference ? ` (${p.reference})` : ""}`),
    "",
    t("waThanks"),
  ].join("\n");
  const phone = d.orders.find((o) => o.customerPhone)?.customerPhone?.replace(/\D/g, "") ?? "";
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 py-4">
      <div className="flex flex-wrap gap-2 print:hidden">
        <PrintButton label={t("print")} />
        <a href={`https://wa.me/${phone}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-xl bg-[#25D366] px-4 font-bold text-black" data-testid="receipt-whatsapp">
          💬 WhatsApp
        </a>
        <Link href="/app/cashier" className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 font-bold">
          {t("backToCashier")}
        </Link>
      </div>
      <article className="rounded-xl border border-border bg-white p-5 font-mono text-[13px] leading-relaxed text-black print:border-0 print:p-0" data-testid="receipt">
        <header className="text-center">
          <p className="text-base font-bold">{r.name}</p>
          {(r.address || r.city) && <p>{[r.address, r.city].filter(Boolean).join(", ")}</p>}
          {r.phones[0] && <p>{formatBfPhone(r.phones[0])}</p>}
        </header>
        <hr className="my-2 border-dashed border-black" />
        <p>
          {t("receipt")} <b>{no}</b>
        </p>
        <p>{format.dateTime(when, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
        {seat && <p>{seat}</p>}
        <hr className="my-2 border-dashed border-black" />
        <table className="w-full">
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="pr-2 align-top">
                  {l.qty} × {pick(l.nameSnapshot)}
                  {l.variantName ? ` (${pick(l.variantName)})` : ""}
                </td>
                <td className="text-right align-top whitespace-nowrap">{l.unitPrice === null ? t("onRequest") : F(l.unitPrice * l.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <hr className="my-2 border-dashed border-black" />
        <dl className="grid grid-cols-[1fr_auto] gap-x-2">
          <dt>{t("subtotal")}</dt>
          <dd className="text-right">{F(d.bill.subtotal)}</dd>
          {d.bill.adjustment > 0 && (
            <>
              <dt>{t("onRequestAmount")}</dt>
              <dd className="text-right">{F(d.bill.adjustment)}</dd>
            </>
          )}
          {d.bill.discount > 0 && (
            <>
              <dt>{t("discount")}</dt>
              <dd className="text-right">− {F(d.bill.discount)}</dd>
            </>
          )}
          <dt className="text-base font-bold">{t("total")}</dt>
          <dd className="text-right text-base font-bold" data-testid="receipt-total">
            {F(d.bill.total)}
          </dd>
        </dl>
        <hr className="my-2 border-dashed border-black" />
        {d.payments.map((p) => (
          <p key={p.id} className="flex justify-between gap-2">
            <span>
              {t(`methods.${p.method}`)}
              {p.splitLabel ? ` (${p.splitLabel})` : ""}
              {p.reference ? ` · ${p.reference}` : ""}
            </span>
            <span>{F(p.amount)}</span>
          </p>
        ))}
        {d.payments
          .filter((p) => p.method === "cash" && p.received)
          .map((p) => (
            <p key={`c-${p.id}`} className="text-[12px]">
              {t("receivedShort", { amount: F(p.received!) })} · {t("changeShort", { amount: F(p.changeGiven ?? 0) })}
            </p>
          ))}
        {d.bill.status !== "paid" && <p className="mt-2 font-bold">{t("dueShort", { amount: F(d.due) })}</p>}
        <hr className="my-2 border-dashed border-black" />
        <p className="text-center">{t("waThanks")}</p>
        <p className="text-center text-[11px]">{t("receiptFooter")}</p>
      </article>
    </div>
  );
}
