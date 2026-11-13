import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";
import { Logo } from "@/components/brand/logo";
import { getDb } from "@/db";
import { restaurants } from "@/db/schema";
import { formatBfPhone, telHref } from "@/lib/format";
import { reservationByToken } from "@/lib/reservations";
import { NOINDEX } from "@/lib/seo/site";
import { cancelReservationAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "RestoCool", robots: NOINDEX };

const TONE: Record<string, string> = {
  requested: "bg-amber-100 text-amber-950",
  confirmed: "bg-emerald-100 text-emerald-900",
  seated: "bg-emerald-100 text-emerald-900",
  completed: "bg-emerald-100 text-emerald-900",
  declined: "bg-red-100 text-red-900",
  cancelled: "bg-red-100 text-red-900",
  no_show: "bg-red-100 text-red-900",
};

/** The customer's own reservation (private link from the emails): status, details, cancel. */
export default async function MyReservation({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const res = await reservationByToken(getDb(), token);
  if (!res) notFound();
  const [b] = await getDb().select().from(restaurants).where(eq(restaurants.id, res.restaurantId));
  if (!b || b.deletedAt) notFound();
  const locale = ["fr", "en", "zh"].includes(res.locale) ? res.locale : "fr";
  const t = await getTranslations({ locale, namespace: "reservation" });
  const when = new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${res.date}T00:00:00Z`));
  const phone = b.phones[0] ?? b.whatsapp;
  const canCancel = res.status === "requested" || res.status === "confirmed";
  const done = (await searchParams).done === "1";
  return (
    <div className="min-h-dvh bg-creme px-4 py-8 text-encre" data-testid="my-reservation" data-status={res.status}>
      <div className="mx-auto flex max-w-md flex-col gap-5">
        <Link href="/" aria-label="RestoCool" className="self-center">
          <Logo />
        </Link>
        <div className="rounded-3xl border border-ligne bg-white p-6 shadow-sm">
          <p className="text-sm text-encre-2">{t("yourReservation")}</p>
          <h1 className="font-display text-2xl font-extrabold">{b.name}</h1>
          <p className={`mt-3 inline-block rounded-full px-3 py-1 text-sm font-bold ${TONE[res.status] ?? "bg-muted"}`} data-testid="reservation-status">
            {t(`status.${res.status}`)}
          </p>
          <p className="mt-2 text-sm text-encre-2">{t(`statusHint.${res.status}`, { business: b.name })}</p>
          {done && (
            <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
              {t("cancelledOk")}
            </p>
          )}
          <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-encre-2">{t("date")}</dt>
            <dd className="font-bold first-letter:uppercase">{when}</dd>
            <dt className="text-encre-2">{t("time")}</dt>
            <dd className="font-bold tabular-nums">{res.time}</dd>
            <dt className="text-encre-2">{t("guests")}</dt>
            <dd className="font-bold">{res.partySize}</dd>
            <dt className="text-encre-2">{t("name")}</dt>
            <dd className="font-bold">{res.name}</dd>
            <dt className="text-encre-2">{t("ref")}</dt>
            <dd className="font-mono font-bold">{res.ref}</dd>
            {(b.address || b.city) && (
              <>
                <dt className="text-encre-2">{t("address")}</dt>
                <dd>{[b.address, b.city].filter(Boolean).join(", ")}</dd>
              </>
            )}
          </dl>
          {res.reason && (res.status === "declined" || res.status === "cancelled") && <p className="mt-4 rounded-xl bg-sable p-3 text-sm">{t("reason", { reason: res.reason })}</p>}
          <div className="mt-6 flex flex-col gap-2">
            {phone && (
              <a href={telHref(phone)} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-vert px-4 font-bold text-creme">
                📞 {t("call", { phone: formatBfPhone(phone) })}
              </a>
            )}
            <Link href={`/r/${b.slug}`} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-ligne px-4 font-bold">
              {t("seeMenu")}
            </Link>
            {canCancel && (
              <form action={cancelReservationAction} className="mt-2">
                <input type="hidden" name="token" value={token} />
                <button type="submit" className="min-h-12 w-full rounded-xl border-2 border-red-300 font-bold text-red-700" data-testid="reservation-cancel">
                  {t("cancel")}
                </button>
              </form>
            )}
          </div>
        </div>
        <p className="text-center text-xs text-encre-2">{t("footer", { business: b.name })}</p>
      </div>
    </div>
  );
}
